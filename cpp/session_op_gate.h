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
// (SendToTargetWorker, session_static.cpp) and the destruction of the engine
// that owns the sessions they operate on.
//
// Why: FIX::Session::lookupSession() hands out a raw, non-owning pointer into
// an engine-owned object, and nothing in QuickFIX keeps that session alive
// while the caller uses it. The engine wraps destroy their FIX engine (which
// deletes every FIX::Session) as soon as stop() settles, so without this gate
// a `sendToTarget()` still running on one libuv thread while `engine.stop()`
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
//   * A worker calls Acquire(id) on its libuv thread to find the gate of the
//     engine owning `id` and hold an OpScope on it for its whole Execute()
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
//     (sendToTarget() -> toApp) can still complete.
//   * The wrap destructor calls Freeze() on the JS thread, but only after
//     Teardown() has deactivated the bridge (waking every pending BlockingCall
//     and making later callbacks pass through) and joined the network threads,
//     so no in-flight operation on THIS engine's sessions can be waiting on the
//     (now blocked) JS thread. Operations on other engines are not involved.
//
// The gate outlives its engine: a worker that looked it up just before the
// engine was unregistered holds it by shared_ptr and passes the (now lifted)
// freeze. By then a NEW engine may own the same id -- its sessions are what
// lookupSession() would now return -- while the worker holds the OLD gate, on
// which the new engine's stop() never waits. Acquire() closes that window by
// re-reading the registry after the OpScope is held: the scope is kept only if
// the gate is still the registered owner, and that owner cannot be destroyed
// while the scope is in flight (Freeze() precedes Unregister() everywhere).
// Together with the wraps rejecting a SessionID that is already live in the
// process, this makes gate == registered owner == the engine whose session
// lookupSession() returns.
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
  // ones to finish. Nests: the stop worker freezes on its thread and the wrap
  // unfreezes later on the JS thread, and in between the destructor (if the
  // wrap is finalized during environment teardown) freezes again around its
  // own DestroyEngine().
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
  // Each id maps to at most one gate at a time: the engine wraps refuse to
  // construct an engine whose SessionID is already live in the process
  // (ConfigError "Duplicate Session"). QuickFIX itself does NOT enforce that --
  // its Session constructor ignores addSession()'s result, so a second engine
  // would silently shadow the first in the process-wide session registry.

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

  // Hold an OpScope on the gate of the engine currently owning `id`, or
  // return nullptr if no engine does (-> SessionNotFound). Constructing the
  // scope may block (the owner is stopping); once it is held the registry is
  // re-read, and the scope is kept only if the same gate is still registered.
  // Otherwise the owner was destroyed while we waited -- possibly replaced by
  // a new engine with the same id -- and we start over against the new owner.
  static std::unique_ptr<OpScope> Acquire(const FIX::SessionID& id) {
    for (;;) {
      std::shared_ptr<SessionOpGate> gate = Lookup(id);
      if (!gate) return nullptr;
      auto scope = std::make_unique<OpScope>(gate);
      if (Lookup(id) == gate) return scope;
    }
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
