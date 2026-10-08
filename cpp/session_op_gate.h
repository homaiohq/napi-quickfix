#ifndef NAPI_QUICKFIX_SESSION_OP_GATE_H
#define NAPI_QUICKFIX_SESSION_OP_GATE_H

#include <condition_variable>
#include <mutex>

namespace napi_quickfix {

// Process-wide gate between the libuv-thread session operations
// (SessionOpWorker, SendToTargetWorker) and engine destruction.
//
// Why: FIX::Session::lookupSession() hands out a raw, non-owning pointer into
// an engine-owned object, and nothing in QuickFIX keeps that session alive
// while the caller uses it. The engine wraps destroy their FIX engine (which
// deletes every FIX::Session) as soon as stop() settles, so without this gate
// a `session.reset()` still running on one libuv thread while `engine.stop()`
// completes would be a use-after-free.
//
// Protocol:
//   * A worker holds an OpScope for its whole Execute() — lookup AND operation.
//     Constructing it blocks while any engine is between Freeze() and
//     Unfreeze(). OpScope is only ever constructed on a libuv thread, so the JS
//     thread never waits here.
//   * The engine's stop worker calls Freeze() on its libuv thread AFTER the
//     FIX engine's own stop() has returned: it blocks new operations and waits
//     for the in-flight ones to drain. The wrap then destroys the engine on the
//     JS thread (OnOK) and calls Unfreeze(). Because Freeze() waits on a libuv
//     thread while the JS loop is free, an in-flight operation blocked in a
//     BlockingCall to JS (e.g. reset() -> toAdmin) can still complete.
//   * The wrap destructor calls Freeze() on the JS thread, but only after
//     ApplicationBridge::Deactivate(), which wakes every pending BlockingCall
//     and makes later callbacks pass through, so no in-flight operation can be
//     waiting on the (now blocked) JS thread.
//
// Freeze()/Unfreeze() nest across engines stopping concurrently.
class SessionOpGate {
 public:
  class OpScope {
   public:
    OpScope() {
      State& s = Get();
      std::unique_lock<std::mutex> lock(s.mtx);
      s.cv.wait(lock, [&s] { return s.frozen == 0; });
      ++s.inflight;
    }
    ~OpScope() {
      State& s = Get();
      {
        std::lock_guard<std::mutex> lock(s.mtx);
        --s.inflight;
      }
      s.cv.notify_all();
    }
    OpScope(const OpScope&) = delete;
    OpScope& operator=(const OpScope&) = delete;
  };

  // Block new session operations and wait for in-flight ones to finish.
  static void Freeze() {
    State& s = Get();
    std::unique_lock<std::mutex> lock(s.mtx);
    ++s.frozen;
    s.cv.wait(lock, [&s] { return s.inflight == 0; });
  }

  // Let session operations run again. Pairs with Freeze().
  static void Unfreeze() {
    State& s = Get();
    {
      std::lock_guard<std::mutex> lock(s.mtx);
      --s.frozen;
    }
    s.cv.notify_all();
  }

 private:
  struct State {
    std::mutex mtx;
    std::condition_variable cv;
    int inflight = 0;
    int frozen = 0;
  };
  static State& Get() {
    static State state;
    return state;
  }
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_SESSION_OP_GATE_H
