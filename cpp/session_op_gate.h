#ifndef NAPI_QUICKFIX_SESSION_OP_GATE_H
#define NAPI_QUICKFIX_SESSION_OP_GATE_H

#include <condition_variable>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <utility>

#include "quickfix/SessionID.h"

namespace napi_quickfix {

// Per-engine gate between the libuv-thread session operations
// (SessionOpWorker, SendToTargetWorker) and the destruction of the engine that
// owns the sessions they operate on.
//
// Why: FIX::Session::lookupSession() hands out a raw, non-owning pointer into
// an engine-owned object, and nothing in QuickFIX keeps that session alive
// while the caller uses it. The engine wraps destroy their FIX engine (which
// deletes every FIX::Session) as soon as stop() settles, so without this gate
// a `session.reset()` still running on one libuv thread while `engine.stop()`
// completes would be a use-after-free.
//
// Why per engine (not process-wide): the gate must only ever couple an
// operation with the engine that owns its session. A process-wide gate made
// `A.stop()` wait for B's in-flight operations, and -- worse -- made the wrap
// destructor, which runs on the JS thread at GC, wait for an operation of
// ANOTHER engine that may itself be blocked in a BlockingCall that only the JS
// thread can service: a hard deadlock. With one gate per engine, the
// destructor only waits for operations on its own sessions, and Teardown()
// has already deactivated this engine's bridge and joined its network threads
// by then, so none of those can be waiting on the JS thread.
//
// Protocol:
//   * Each engine wrap owns a `std::shared_ptr<SessionOpGate>` and registers
//     it for its SessionIDs (Register) right after constructing the FIX engine,
//     on the JS thread; it unregisters (Unregister) right before destroying it.
//   * A worker calls Lookup(id) on its libuv thread to find the gate of the
//     engine owning `id`, then holds an OpScope on it for its whole Execute()
//     -- lookupSession AND the operation. Constructing the OpScope blocks while
//     that engine is between Freeze() and Unfreeze(). No registered gate means
//     no engine owns the session: the worker reports SessionNotFound without
//     touching the registry QuickFIX keeps.
//   * The engine's stop worker calls Freeze() on its libuv thread AFTER the FIX
//     engine's own stop() has returned: it blocks new operations on this
//     engine's sessions and waits for the in-flight ones to drain. The wrap
//     then unregisters and destroys the engine on the JS thread (OnOK) and
//     calls Unfreeze(). Because Freeze() waits on a libuv thread while the JS
//     loop is free, an in-flight operation blocked in a BlockingCall to JS
//     (e.g. reset() -> toAdmin) can still complete.
//   * The wrap destructor calls Freeze() on the JS thread, but only after
//     Teardown() has deactivated the bridge (waking every pending BlockingCall
//     and making later callbacks pass through) and joined the network threads,
//     so no in-flight operation on THIS engine's sessions can be waiting on the
//     (now blocked) JS thread. Operations on other engines are not involved.
//
// The gate outlives its engine: a worker that looked it up just before the
// engine was unregistered holds it by shared_ptr, passes the (now lifted)
// freeze, and gets SessionNotFound from lookupSession.
class SessionOpGate {
 public:
  class OpScope {
   public:
    explicit OpScope(std::shared_ptr<SessionOpGate> gate)
        : gate_(std::move(gate)) {
      std::unique_lock<std::mutex> lock(gate_->mtx_);
      gate_->cv_.wait(lock, [this] { return gate_->frozen_ == 0; });
      ++gate_->inflight_;
    }
    ~OpScope() {
      {
        std::lock_guard<std::mutex> lock(gate_->mtx_);
        --gate_->inflight_;
      }
      gate_->cv_.notify_all();
    }
    OpScope(const OpScope&) = delete;
    OpScope& operator=(const OpScope&) = delete;

   private:
    std::shared_ptr<SessionOpGate> gate_;
  };

  SessionOpGate() = default;
  SessionOpGate(const SessionOpGate&) = delete;
  SessionOpGate& operator=(const SessionOpGate&) = delete;

  // Block new operations on this engine's sessions and wait for the in-flight
  // ones to finish. Nests (a Freeze() from the stop worker and one from the
  // destructor may overlap).
  void Freeze() {
    std::unique_lock<std::mutex> lock(mtx_);
    ++frozen_;
    cv_.wait(lock, [this] { return inflight_ == 0; });
  }

  // Let operations run again. Pairs with Freeze().
  void Unfreeze() {
    {
      std::lock_guard<std::mutex> lock(mtx_);
      --frozen_;
    }
    cv_.notify_all();
  }

  // --- registry: SessionID -> owning engine's gate ---------------------------
  // QuickFIX rejects two live engines sharing a SessionID ("Duplicate
  // Session"), so each id maps to at most one gate at a time.

  static void Register(const std::set<FIX::SessionID>& ids,
                       const std::shared_ptr<SessionOpGate>& gate) {
    Registry& r = GetRegistry();
    std::lock_guard<std::mutex> lock(r.mtx);
    for (const FIX::SessionID& id : ids) r.gates[id] = gate;
  }

  // Remove `ids` only where they still point at `gate`: a new engine may
  // already have registered the same ids after this one unregistered them.
  static void Unregister(const std::set<FIX::SessionID>& ids,
                         const SessionOpGate* gate) {
    Registry& r = GetRegistry();
    std::lock_guard<std::mutex> lock(r.mtx);
    for (const FIX::SessionID& id : ids) {
      auto it = r.gates.find(id);
      if (it != r.gates.end() && it->second.get() == gate) r.gates.erase(it);
    }
  }

  // The gate of the engine owning `id`, or nullptr if no engine does.
  static std::shared_ptr<SessionOpGate> Lookup(const FIX::SessionID& id) {
    Registry& r = GetRegistry();
    std::lock_guard<std::mutex> lock(r.mtx);
    auto it = r.gates.find(id);
    return it == r.gates.end() ? nullptr : it->second;
  }

 private:
  struct Registry {
    std::mutex mtx;
    std::map<FIX::SessionID, std::shared_ptr<SessionOpGate>> gates;
  };
  static Registry& GetRegistry() {
    static Registry registry;
    return registry;
  }

  std::mutex mtx_;
  std::condition_variable cv_;
  int inflight_ = 0;
  int frozen_ = 0;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_SESSION_OP_GATE_H
