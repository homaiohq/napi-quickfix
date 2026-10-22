// The reply channel shared by the two bridges that park a QuickFIX/libuv
// thread on a JS result: ApplicationBridge (toAdmin/toApp/fromAdmin/fromApp)
// and JsMessageStoreFactory (every message-store call). One implementation of
// the wait, the wake and the "deactivate" protocol, so the two cannot drift.
#ifndef NAPI_QUICKFIX_SYNC_CHANNEL_H
#define NAPI_QUICKFIX_SYNC_CHANNEL_H

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <memory>
#include <mutex>
#include <unordered_map>
#include <utility>

namespace napi_quickfix {

// One reply slot. Heap-allocated and shared (shared_ptr) between the waiting
// thread and whoever fulfils it (the JS trampoline, a promise continuation,
// or the bridge's Deactivate()/Abort() during teardown), so neither side can
// dangle. Guarded by a mutex + condition_variable so the waiter can be woken
// by any of them, rather than blocking forever on a future when the JS loop
// is frozen inside a cleanup hook.
template <typename Outcome>
struct SyncChannel {
  std::mutex mtx;
  std::condition_variable cv;
  bool done = false;
  // Set by the waiter when it gave up on a deadline: a fulfilment that
  // arrives afterwards is "late" (the store records it for its poison
  // bookkeeping; see js_message_store.h) and must not be mistaken for a
  // result anyone is waiting on.
  bool expired = false;
  Outcome outcome;

  enum class Fulfilment { kFulfilled, kAlreadyDone, kExpired };

  // Store `o` and wake the waiter, unless the channel is already done or the
  // waiter has given up. The notify runs UNDER mtx on purpose: the waiter
  // cannot re-acquire the mutex (and go on to drop its reference) before
  // notify_all() has returned, so the condition variable is never destroyed
  // out from under a notify in flight.
  Fulfilment TryFulfil(Outcome o) {
    std::lock_guard<std::mutex> lock(mtx);
    if (done) return Fulfilment::kAlreadyDone;
    if (expired) return Fulfilment::kExpired;
    outcome = std::move(o);
    done = true;
    cv.notify_all();
    return Fulfilment::kFulfilled;
  }

  // Deactivate()/Abort(): wake the waiter with `o` whatever the state (an
  // expired channel has no waiter; marking it done is harmless and keeps a
  // later continuation from treating it as late).
  void ForceFulfil(Outcome o) {
    std::lock_guard<std::mutex> lock(mtx);
    if (done) return;
    outcome = std::move(o);
    done = true;
    cv.notify_all();
  }

  // Block until done. With a positive timeout, returns false and marks the
  // channel expired if the deadline passed first (the registry entry is then
  // left to the fulfiller, see PendingChannels::Erase).
  bool Wait(std::chrono::milliseconds timeout) {
    std::unique_lock<std::mutex> lock(mtx);
    if (timeout.count() > 0) {
      const auto deadline = std::chrono::steady_clock::now() + timeout;
      if (!cv.wait_until(lock, deadline, [this] { return done; })) {
        expired = true;
        return false;
      }
      return true;
    }
    cv.wait(lock, [this] { return done; });
    return true;
  }
};

// The channels a bridge has in flight, plus the inactive flag that stops new
// ones from being registered once the bridge is going down.
//
// Invariant: Deactivate() stores inactive_ BEFORE it takes mtx_ to wake the
// pending channels, and Register() re-checks inactive_ UNDER mtx_. So a
// registration that saw inactive_ unset is already in the map when the wake
// loop runs, and one that lost the race is refused; either way no caller can
// start waiting after the wake. The JS thread relies on this when it blocks
// on a network thread after Deactivate() (Teardown's stop() join, the
// destructor's gate freeze).
template <typename Channel>
class PendingChannels {
 public:
  bool Inactive() const { return inactive_.load(std::memory_order_acquire); }

  // Returns false (nothing registered) if the registry is inactive.
  bool Register(const std::shared_ptr<Channel>& ch, std::uint64_t& id) {
    std::lock_guard<std::mutex> lock(mtx_);
    if (inactive_.load(std::memory_order_acquire)) return false;
    id = next_++;
    map_[id] = ch;
    return true;
  }

  void Erase(std::uint64_t id) {
    std::lock_guard<std::mutex> lock(mtx_);
    map_.erase(id);
  }

  // Run `fn(channel)` for the channel registered as `id`, if any, under the
  // registry lock, and erase it afterwards if `fn` returns true. Used by the
  // promise continuations: the lookup, the fulfilment and the drop of the
  // continuation's temporary reference all happen under mtx_, so the waiting
  // thread -- which erases its own entry under the same lock once woken --
  // is the channel's last owner on the normal path. Lock order: mtx_ ->
  // Channel::mtx (the waiter never holds Channel::mtx while taking mtx_).
  template <typename Fn>
  bool WithChannel(std::uint64_t id, Fn fn) {
    std::lock_guard<std::mutex> lock(mtx_);
    auto it = map_.find(id);
    if (it == map_.end()) return false;
    if (fn(it->second)) map_.erase(it);
    return true;
  }

  // Mark the registry inactive and run `fulfil(channel)` for every channel
  // still registered, so no waiter is left blocked once the JS side can no
  // longer serve it. Idempotent.
  template <typename Fn>
  void Deactivate(Fn fulfil) {
    inactive_.store(true, std::memory_order_release);
    std::lock_guard<std::mutex> lock(mtx_);
    for (auto& kv : map_) fulfil(kv.second);
  }

 private:
  std::mutex mtx_;
  std::unordered_map<std::uint64_t, std::shared_ptr<Channel>> map_;
  std::uint64_t next_ = 0;
  std::atomic<bool> inactive_{false};
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_SYNC_CHANNEL_H
