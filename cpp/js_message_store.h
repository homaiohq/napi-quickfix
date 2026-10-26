// A FIX::MessageStore backed by a JS adapter object (MessageStoreAdapter in
// src/store.ts), so session state can be persisted write-through in any
// database Node can reach, without a client library in the prebuild.
//
// Shape: one adapter object per engine, keyed by SessionID (the adapter
// receives the id on every call). The JS layer hands the factory a *bridge*
// object whose methods always return a Promise (sync returns and throws are
// normalised) and which carries a storeError(sessionID, method, message,
// poisoned) reporter:
//   load(sid) -> state | null          create(sid, state)
//   setSeqNums(sid, s, t)              setMessage(sid, seq, msg)
//   getMessages(sid, b, e) -> string[] reset(sid, state)
//
// Threads and dispatch. FIX::MessageStore is synchronous and every call runs
// under SessionState::m_mutex ("SS"), on whichever thread touched the
// session: the engine's network thread, a sendToTarget() libuv worker
// (Session::sendRaw), a SessionOpWorker (setNext*/refresh), or the JS thread
// itself for the engine constructor (Session::Session reads the creation
// time and may reset()) and destructor. The rule, observed in the issue #29
// spike: the JS thread may take SS only in the constructor/destructor, when
// no other thread owns the session; everywhere else the thread holding SS
// parks on a dedicated TypedThreadSafeFunction (BlockingCall + a promise-
// aware SyncChannel) until the JS event loop has served the call, released
// by the promise continuation, by the per-call timeout, or by Deactivate()/
// Abort() during teardown (-> "aborted" -> IOException). On the JS thread the
// bridge is called directly and never awaited (CallDirect): the TS layer
// collects the Promise and `Initiator.create()` awaits it. The sequence
// numbers and the creation time are cached (a MemoryStore, like upstream's
// PostgreSQLStore), updated only AFTER the adapter acknowledged a write
// (DB-first; upstream's incr* bump the cache first), so a rejected write
// leaves cache and DB equal. The getters read the cache; the JS thread reads
// it through SessionWrap without entering FIX::Session (Lookup()).
//
// Failure policy (README "Message store"; the rationale is the spike report):
//   * setMessage / getMessages: any failure -> IOException, never fatal
//     (sendRaw returns false and the seqnum is reused; a resend request is
//     answered by a disconnect and the peer re-requests).
//   * setSeqNums / reset: a rejection, a timeout or a late settlement
//     poisons the store; refresh (load): a rejection or timeout does too. A
//     poisoned store fails every write at once with IOException (inside
//     sendRaw()'s try, so nothing stamped from its cache reaches the wire:
//     the session's sends fail). Poison lifts once every timed-out write
//     has settled (so a late write has landed) and the next call of any
//     kind has reloaded the cache through load(); at most one reload is in
//     flight, and a failed reload keeps the store poisoned for the next
//     attempt. After a plain rejection that next call (the network thread's
//     next tick at the latest) usually lifts it with the session still up.
//     While it cannot lift, every inbound message ends in an
//     incrNextTargetMsgSeqNum() that throws, so QuickFIX disconnects the
//     session at its next inbound message (a heartbeat at the latest); a
//     failure of that inbound write itself disconnects at once.
//   * A failed reset() is not undone by that reload, which would restore the
//     numbers QuickFIX meant to discard (a ResetOnLogon=Y Logon would leave
//     with the old MsgSeqNum and no ResetSeqNumFlag). It stays pending, and
//     the reload that lifts the poison is the reset itself, retried with its
//     original timestamp (refresh() included). The cache takes the reset
//     numbers at once anyway, as upstream's stores do (cache first): each
//     read QuickFIX makes on its way to the wire retries the reset on its
//     own, and they must agree whichever retry succeeds (a Logon's
//     ResetSeqNumFlag and its MsgSeqNum are two reads). So until the retry
//     lands, QuickFIX's getters read 1/1 while the adapter's row still holds
//     the old numbers (JS's getExpected*() throw: the store is poisoned).
//   * A message stamped from the cache while the store was poisoned, whose
//     persist() then finds the poison lifted by a reload that moved the
//     sender seqnum, is refused (set(): its MsgSeqNum is no longer the next
//     sender seqnum; incrNextSenderMsgSeqNum() with PersistMessages=N: the
//     store was poisoned on entry): IOException + non-poisoning 'storeError',
//     nothing sent. set() refuses the same way a message whose sender
//     seqnum a Session.setNextSenderMsgSeqNum() worker moved between fill()
//     and persist() (see session_wrap.cpp).
//   * A reload (refresh or poison) whose load() returns null finds the row
//     gone: like upstream's refresh() (cache reset, then populateCache()
//     INSERTs a 1/1 row), the numbering restarts at 1/1 with a new creation
//     time, persisted through create() before the cache takes it.
//   * A sequence number above 2^53-1 (Number.MAX_SAFE_INTEGER) is refused
//     BEFORE it reaches the bridge: the dispatcher hands seqnums to JS as
//     doubles, so a larger value would arrive rounded and the adapter would
//     persist a number the engine never had (ReadSeq() already refuses such
//     values coming back). The counterparty can reach it (a SequenceReset
//     with GapFillFlag=N carries a 64-bit NewSeqNo into
//     setNextTargetMsgSeqNum()). Refused like a non-fatal adapter failure:
//     IOException + 'storeError', no poison (nothing was sent, cache and DB
//     are still equal), and QuickFIX's handler disconnects the session.
//   * reset(), refresh(), and the three getters NEVER throw into QuickFIX,
//     because each has a call site with no handler: Session::disconnect()
//     (ResetOnDisconnect=Y) runs reset() inside the catch(IOException&)
//     handlers of Session::next(); Session::setResponder() on the connect
//     path runs refresh() (RefreshOnLogon=Y), getCreationTime() (through
//     checkSessionTime()) and, outside the session period, Session::reset(),
//     whose generateLogout() -> fill() reads the sender seqnum before
//     sendRaw()'s try; there the acceptor has no handler (std::terminate,
//     observed) and the initiator swallows the exception with the session
//     left "pending" for good. QuickFIX's own catch (RejectLogon&) and catch
//     (UnsupportedVersion&) also call generateLogout(), and
//     Session::next(Message) reads getExpectedTargetNum() in nextQueued()
//     after its handlers, on every inbound message. The two writes poison and
//     report instead; the getters still attempt the reload while poisoned,
//     then return the cached value. With the sender getter never throwing, a
//     poisoned initiator's Logon fails at persist() after QuickFIX marked it
//     sent, so that connection attempt ends at LogonTimeout.
//   * Inside one of QuickFIX's own catch handlers (std::current_exception()
//     is set), incrNextTargetMsgSeqNum() does not throw either: catch
//     (UnsupportedVersion&) increments the target seqnum with no guard
//     (std::terminate, observed: a wrong BeginString from the peer). The
//     failure is recorded (poison / 'storeError') and the cache left as is.
//     (nextQueued() can also incrNextTargetMsgSeqNum() unguarded and outside
//     any handler, for a queued Logon or ResendRequest at exactly the
//     expected seqnum; that exposure is upstream's own, a FileStore write
//     failure terminates there too.)
//   * A per-call timeout (storeTimeoutMs, default 30 s, 0 = none) bounds how
//     long a QuickFIX thread can be parked: a never-settling adapter would
//     otherwise freeze every session of the engine and make a graceful
//     stop() (Initiator::stop() -> logout() takes SS) and process exit wait
//     on it forever.
//
// Lock order (ARCHITECTURE §5): SS -> {LOOP, C} where C is the store's cache
// mutex, a leaf never held across a JS call; SS -> R (Session::s_mutex, leaf)
// for the session-log event; never LOOP -> SS outside construction/
// destruction.
#ifndef NAPI_QUICKFIX_JS_MESSAGE_STORE_H
#define NAPI_QUICKFIX_JS_MESSAGE_STORE_H

#include <napi.h>

#include <chrono>
#include <cstdint>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "quickfix/FieldTypes.h"
#include "quickfix/MessageStore.h"
#include "quickfix/SessionID.h"
#include "sync_channel.h"

namespace napi_quickfix {

class JsMessageStore;

class JsMessageStoreFactory : public FIX::MessageStoreFactory {
 public:
  struct State {
    FIX::UtcTimeStamp creationTime = FIX::UtcTimeStamp::now();
    FIX::SEQNUM nextSender = 1;
    FIX::SEQNUM nextTarget = 1;
  };

  enum class Method { kLoad, kCreate, kSetSeqNums, kSetMessage, kGetMessages, kReset, kClose };
  static const char* MethodName(Method m);

  struct Request {
    Method method = Method::kLoad;
    FIX::SessionID id;
    FIX::SEQNUM a = 0;
    FIX::SEQNUM b = 0;
    std::string msg;
    State state;
  };

  enum class Status {
    kOk,
    kThrew,     // adapter threw / rejected, or returned a malformed value: `error`
    kAborted,   // released by Deactivate()/Abort(), or no bridge on this thread
    kTimedOut,  // the per-call deadline passed; the Promise may still settle
    kPending,   // Invoke() only: a Promise was bound to the continuations
  };

  struct Outcome {
    Status status = Status::kOk;
    std::string error;
    std::vector<std::string> strings;  // getMessages
    bool present = false;              // load: a row exists
    State state;                       // load
  };

  // The reply channel, tagged with what was asked so a late settlement can be
  // attributed (see OnSettled).
  struct Channel : SyncChannel<Outcome> {
    Method method = Method::kLoad;
    FIX::SessionID id;
  };

  // Construct on the JS thread. `bridge` is the TS-side bridge object;
  // `seeds` the per-session state the TS layer preloaded through
  // load()/create() (the engine constructor needs it synchronously);
  // `timeoutMs` the per-call deadline (0 = none).
  JsMessageStoreFactory(Napi::Env env, Napi::Object bridge,
                        std::map<FIX::SessionID, State> seeds, int timeoutMs);
  ~JsMessageStoreFactory() override;

  // FIX::MessageStoreFactory. JS thread only (engine construction /
  // destruction). create() throws ConfigError for an id with no seed.
  FIX::MessageStore* create(const FIX::UtcTimeStamp& now,
                            const FIX::SessionID& id) override;
  void destroy(FIX::MessageStore* store) override;

  // Teardown protocol, mirroring ApplicationBridge: Deactivate() marks the
  // bridge inactive and wakes every waiter with `aborted` (no TSFN op, safe
  // on a frozen loop); Release()/Abort() additionally release/abort the TSFN;
  // DropBridge() drops the rooted bridge object (JS thread, once no call can
  // reach JS any more); Ref/Unref follow the engine's ref()/unref().
  void Deactivate();
  void Release();
  void Abort();
  void DropBridge();
  void Ref(Napi::Env env);
  void Unref(Napi::Env env);

  // Serve `req` through the bridge. Any thread but the JS thread: blocks
  // until the adapter settled, the deadline passed, or the factory was
  // deactivated. On the JS thread it returns kAborted at once (the loop
  // cannot serve a call that blocks it).
  Outcome Call(const Request& req);

  // JS thread only (engine constructor): call the bridge directly. A Promise
  // result is NOT awaited (the TS layer collects it) and counts as kOk; a
  // synchronous value is parsed; a synchronous throw is kThrew.
  Outcome CallDirect(const Request& req);

  // Report a store failure to JS as a 'storeError' event, from any thread.
  // `late`: the call had already been failed by the timeout.
  void ReportError(const FIX::SessionID& id, Method method,
                   const std::string& message, bool poisoned, bool late);

  bool OnJsThread() const { return std::this_thread::get_id() == jsThread_; }
  int TimeoutMs() const { return timeoutMs_; }

  // Engine constructor options (JS thread): `storeStates`, an array of
  // { sessionID, creationTime, nextSenderMsgSeqNum, nextTargetMsgSeqNum }
  // the TS layer preloaded, and `storeTimeoutMs` (undefined -> 30000;
  // otherwise a non-negative integer, 0 = no timeout). Throw TypeError /
  // RangeError on a malformed value.
  static std::map<FIX::SessionID, State> ReadSeeds(Napi::Env env, Napi::Value v);
  static int ReadTimeout(Napi::Env env, Napi::Value v);

  // The live JsMessageStore of `id`, or nullptr. The registry is written by
  // create()/destroy() on the JS thread; readers: SessionWrap's getters (JS
  // thread, so a store found here is alive for the duration of the call), a
  // SessionOpWorker under the engine's gate (the engine, hence the store,
  // cannot be destroyed meanwhile), and the promise continuations (JS
  // thread).
  static JsMessageStore* Lookup(const FIX::SessionID& id);

 private:
  struct CallData;
  // Shared between the factory and the two persistent promise continuations
  // (which may outlive the factory: a bound continuation lives as long as
  // the adapter's Promise does). `factory` is nulled by the destructor on
  // the JS thread, the only thread that reads it.
  struct Shared {
    PendingChannels<Channel> pending;
    JsMessageStoreFactory* factory = nullptr;
  };

  static void CallJs(Napi::Env env, Napi::Function, JsMessageStoreFactory* self,
                     CallData* data);
  using TSFN = Napi::TypedThreadSafeFunction<JsMessageStoreFactory, CallData,
                                             JsMessageStoreFactory::CallJs>;

  // JS thread: call the bridge method for `req`; a Promise result is wired
  // to the continuations with `channelId` (bridged call) or ignored
  // (direct call, channelId == kNoChannel); a sync result/throw is returned.
  static constexpr std::uint64_t kNoChannel = ~std::uint64_t{0};
  Outcome Invoke(Napi::Env env, const Request& req, std::uint64_t channelId);
  // JS thread: a bridged call's Promise settled.
  static void OnSettled(const std::shared_ptr<Shared>& shared, Napi::Env env,
                        std::uint64_t channelId, bool fulfilled,
                        Napi::Value value);
  // JS thread: a timed-out call settled late or was dropped unrun (`how`
  // says which, for the report): balance the store's poison bookkeeping.
  static void SettledLate(const std::shared_ptr<Shared>& shared, Method method,
                          const FIX::SessionID& id, const std::string& how);
  static Outcome ParseResult(Napi::Env env, Method method, Napi::Value value);
  void DeliverReport(Napi::Env env, const CallData& data);

  Napi::ObjectReference bridge_;
  Napi::FunctionReference onFulfilled_;
  Napi::FunctionReference onRejected_;
  TSFN tsfn_;
  bool released_ = false;
  std::thread::id jsThread_;
  std::shared_ptr<Shared> shared_;
  std::map<FIX::SessionID, State> seeds_;
  int timeoutMs_;
};

// Mirrors upstream PostgreSQLStore: a MemoryStore cache for the sequence
// numbers and creation time, write-through for everything else; the cache is
// updated AFTER the adapter acknowledged (see the file comment).
class JsMessageStore : public FIX::MessageStore {
 public:
  using Factory = JsMessageStoreFactory;

  JsMessageStore(Factory& factory, const FIX::SessionID& id,
                 const Factory::State& seed);

  // FIX::MessageStore. Called under SessionState::m_mutex on a QuickFIX or
  // libuv thread (or, for getCreationTime/reset, on the JS thread from the
  // engine constructor).
  bool set(FIX::SEQNUM, const std::string&) EXCEPT(FIX::IOException) override;
  void get(FIX::SEQNUM, FIX::SEQNUM, std::vector<std::string>&) const
      EXCEPT(FIX::IOException) override;
  FIX::SEQNUM getNextSenderMsgSeqNum() const EXCEPT(FIX::IOException) override;
  FIX::SEQNUM getNextTargetMsgSeqNum() const EXCEPT(FIX::IOException) override;
  void setNextSenderMsgSeqNum(FIX::SEQNUM) EXCEPT(FIX::IOException) override;
  void setNextTargetMsgSeqNum(FIX::SEQNUM) EXCEPT(FIX::IOException) override;
  void incrNextSenderMsgSeqNum() EXCEPT(FIX::IOException) override;
  void incrNextTargetMsgSeqNum() EXCEPT(FIX::IOException) override;
  FIX::UtcTimeStamp getCreationTime() const EXCEPT(FIX::IOException) override;
  // Never throw (see the file comment): a failure poisons and reports.
  void reset(const FIX::UtcTimeStamp& now) EXCEPT(FIX::IOException) override;
  void refresh() EXCEPT(FIX::IOException) override;

  const FIX::SessionID& SessionID() const { return id_; }

  // JS-thread reads for SessionWrap::getExpected*: the cache under C, no
  // bridge hop, no reload; IOException when poisoned (so a caller cannot act
  // on a number the store may not hold).
  FIX::SEQNUM CachedNextSender() const EXCEPT(FIX::IOException);
  FIX::SEQNUM CachedNextTarget() const EXCEPT(FIX::IOException);

  // For SessionOpWorker::refresh(): refresh() cannot throw, so the worker
  // asks afterwards whether the store is poisoned and rejects IOException.
  bool Poisoned() const;
  std::string LastError() const;

  // JS thread, from the factory: a write that had timed out has settled, or
  // was dropped before the adapter saw it.
  void OnLateSettlement(Factory::Method method);

 private:
  Factory::State Snapshot() const;  // under C
  void Apply(const Factory::State& s) const;  // under C
  // Poison gate for every call that reaches the store: throws IOException if
  // the store is poisoned and cannot be reloaded now; otherwise reloads the
  // cache (one reload at a time, through the bridge; a pending reset is
  // retried instead, see RetryReset()) and lifts the poison, or throws if
  // that failed. `what` names the caller for the message.
  void Gate(const char* what) const;
  // load() and apply; a missing row is recreated at 1/1 through create().
  // Not under C. On failure returns the outcome, `failed` names the method.
  Factory::Outcome Reload(Factory::Method& failed) const;
  // reset() through the bridge with `when`, the timestamp of the reset a
  // failure left pending, and apply it. Not under C. On failure returns the
  // outcome, `failed` is kReset.
  Factory::Outcome RetryReset(const FIX::UtcTimeStamp& when,
                              Factory::Method& failed) const;
  // Forward to the factory and translate: kOk returns; anything else throws
  // IOException. For `fatal` methods a rejection or timeout poisons first.
  Factory::Outcome Forward(Factory::Request req, bool fatal) const;
  // Enter the poisoned state (idempotent), log and report.
  void Poison(Factory::Method method, const std::string& why,
              bool unsettled) const;
  // Session-log event, from a QuickFIX/libuv thread only (SessionState::
  // onEvent takes SS, which that thread already holds; the JS thread must
  // never take it).
  void LogEvent(const std::string& text) const;
  // Throw IOException (helper so the message shape is uniform).
  [[noreturn]] void Throw(Factory::Method method, const std::string& why) const;
  // Refuse a sequence number a JS number cannot carry exactly (> 2^53-1)
  // before it is forwarded: reports a non-poisoning 'storeError' for
  // `method` and throws IOException. `what` names the member for the text.
  void CheckSafeSeq(FIX::SEQNUM n, Factory::Method method, const char* what) const;
  // Refuse a message whose MsgSeqNum is no longer the next sender seqnum (a
  // reload moved the cache between fill() and persist()): reports a
  // non-poisoning 'storeError' and throws IOException.
  void CheckStamp(FIX::SEQNUM seq) const;

  Factory& factory_;
  FIX::SessionID id_;
  mutable std::mutex mtx_;  // C
  mutable FIX::MemoryStore cache_;
  mutable bool poisoned_ = false;
  // Timed-out setSeqNums/reset/create calls whose Promise has not settled
  // yet: the poison cannot lift while one is pending (its write may still
  // land). May read -1 for a moment (see OnLateSettlement()).
  mutable int unsettled_ = 0;
  // A reset() that failed: Gate() retries it (RetryReset()) instead of
  // reloading. Implies poisoned_.
  mutable bool pendingReset_ = false;
  mutable FIX::UtcTimeStamp pendingResetTime_ = FIX::UtcTimeStamp::now();
  mutable bool reloadInFlight_ = false;
  mutable std::string lastError_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_JS_MESSAGE_STORE_H
