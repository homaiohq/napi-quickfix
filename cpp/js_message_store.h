// A FIX::MessageStore backed by a JS adapter object (MessageStoreAdapter in
// src/store.ts), so session state can be persisted write-through in any
// database Node can reach, without a client library in the prebuild.
//
// Shape: one adapter per engine, keyed by SessionID. FIX::MessageStore is
// synchronous and every call runs under SessionState::m_mutex, on whichever
// thread touched the session; that thread parks on a dedicated TSFN until the
// TS bridge's Promise settles, the per-call timeout passes, or teardown aborts
// it. The sequence numbers and the creation time are cached (a MemoryStore,
// like upstream's PostgreSQLStore), updated only AFTER the adapter
// acknowledged a write (DB-first; upstream's incr* bump the cache first).
//
// The mechanism -- dispatch, the Health state model and Decide(), which
// failures poison, the fences, the members that never throw into QuickFIX and
// why, teardown -- is ARCHITECTURE.md section 4b; the lock order is its
// section 5 "Lock order". The user-facing contract is README "Message store".
#ifndef NAPI_QUICKFIX_JS_MESSAGE_STORE_H
#define NAPI_QUICKFIX_JS_MESSAGE_STORE_H

#include <napi.h>

#include <chrono>
#include <cstdint>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
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

  enum class Method { kLoad, kCreate, kSetSeqNums, kSetMessage, kGetMessages, kReset };
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
    FIX::SEQNUM seq = 0;  // Request::a: setMessage's seqnum
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
  // otherwise an integer from 0 to 2^31-1, 0 = no timeout). The TS layer
  // validated both; these only assert it ("internal: ..." TypeError /
  // RangeError), so nothing malformed is converted silently.
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

  // JS thread: call the bridge method for `req`; a sync result/throw is
  // returned. A Promise result is wired to the continuations with
  // `channelId` (bridged call) and yields nullopt: the continuation settles
  // the channel later. With channelId == kNoChannel (direct call) it is
  // ignored and counts as kOk, so a direct call always has an outcome.
  static constexpr std::uint64_t kNoChannel = ~std::uint64_t{0};
  std::optional<Outcome> Invoke(Napi::Env env, const Request& req,
                                std::uint64_t channelId);
  // JS thread: a bridged call's Promise settled.
  static void OnSettled(const std::shared_ptr<Shared>& shared, Napi::Env env,
                        std::uint64_t channelId, bool fulfilled,
                        Napi::Value value);
  // JS thread: a timed-out call settled late or was dropped unrun (`how`
  // says which, for the report): balance the store's bookkeeping (poison, or
  // the unsettled setMessage of `seq`).
  static void SettledLate(const std::shared_ptr<Shared>& shared, Method method,
                          const FIX::SessionID& id, FIX::SEQNUM seq,
                          const std::string& how);
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
// updated AFTER the adapter acknowledged (ARCHITECTURE.md 4b "Cache").
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
  // Never throw: each has a call site with no IOException handler
  // (ARCHITECTURE.md 4b); a failure poisons and reports.
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

  // For the same worker: whether the last refresh() run on the calling thread
  // was aborted by teardown (its load() released, nothing read). A healthy
  // store stays healthy then (not Poisoned()), so it needs its own answer.
  // Per thread, cleared on read.
  static bool TakeRefreshAborted();

  // JS thread, from the factory: a write that had timed out has settled, or
  // was dropped before the adapter saw it (`seq`: setMessage's seqnum).
  void OnLateSettlement(Factory::Method method, FIX::SEQNUM seq);

 private:
  // Whether the cache can be trusted to match the adapter's row.
  enum class Health {
    kOk,
    // A fatal call failed (setSeqNums/reset rejected or timed out, a
    // refresh's load()/create() failed): the cache may disagree with the row,
    // and a reload through load() lifts the poison.
    kPoisoned,
    // Poisoned by a failed reset(): the cache already holds the reset
    // numbers, and only that reset retried with its original timestamp
    // (RetryReset()) lifts the poison; a reload would restore the numbers
    // QuickFIX meant to discard.
    kResetPending,
  };

  // Who asks Decide() what to do about the store's health.
  enum class Caller {
    kCall,     // a write, get(), getCreationTime(): may reload
    kGetter,   // the seqnum getters: never move the cache (no plain reload)
    kRefresh,  // refresh(): reloads a healthy store too
  };
  // Decide()'s verdict.
  enum class Step {
    kNone,        // healthy (refresh(): the reload in flight serves it)
    kRefuse,      // poisoned and cannot recover now: IOException(`refusal`)
    kRefresh,     // healthy, refresh(): reload; a failure poisons
    kReload,      // kPoisoned: reload; success lifts the poison
    kRetryReset,  // kResetPending: retry the reset at `resetTime`
  };
  struct Plan {
    Step step;
    std::string refusal;
    FIX::UtcTimeStamp resetTime;
  };

  Factory::State Snapshot() const;  // under C
  void Apply(const Factory::State& s) const;  // under C

  // Health transitions: the only writers of health_, resetTime_, lastError_,
  // reloadInFlight_, unsettled_ and unsettledSets_. All under C; none logs or
  // reports (C is a leaf: the caller does both once it released C).
  //
  // A fatal call failed: kOk -> kPoisoned; a pending reset stays pending
  // (its retry, not a reload, is what lifts it). Records `why` as the last
  // error and counts a timed-out call as unsettled.
  void EnterPoison(Factory::Method method, const std::string& why,
                   bool timedOut) const;
  // reset() failed on a poisoned store (no-op on a healthy one, which only a
  // teardown abort leaves behind): kResetPending at `when`, superseding any
  // earlier pending reset, and the cache takes the reset numbers at once.
  void MarkResetPending(const FIX::UtcTimeStamp& when) const;
  // The decision table: what `caller` must do before it proceeds. Pure.
  Plan Decide(Caller caller) const;
  // A reload step starts / ended with `o` (`failed` names the method that
  // failed). Success: kOk. Failure: a healthy store (refresh()) is poisoned
  // unless a teardown aborted it; a poisoned one keeps its health (a pending
  // reset stays pending) and records the new error.
  void BeginReload() const;
  void EndReload(const Factory::Outcome& o, Factory::Method failed) const;
  // The one writer of the two unsettled counters: `delta` is +1 for a call
  // of `method` that timed out (by its waiter), -1 for its late settlement.
  // setMessage counts per seqnum (`seq`) in unsettledSets_, the fatal calls
  // in unsettled_.
  void CountUnsettled(Factory::Method method, FIX::SEQNUM seq, int delta) const;

  // Takes C: Decide(), and BeginReload() if the verdict is a reload step.
  Plan Triage(Caller caller) const;
  // Poison gate for every call that reaches the store: throws IOException if
  // the store is poisoned and cannot be reloaded now; otherwise reloads the
  // cache (one reload at a time, through the bridge; a pending reset is
  // retried instead, see RetryReset()) and lifts the poison, or throws if
  // that failed. `what` names the caller for the message. kGetter (the
  // seqnum getters): only a pending reset is retried, which leaves the cache
  // as it is; a plain reload is refused (throws).
  void Gate(const char* what, Caller caller = Caller::kCall) const;
  // Run a reload step of Decide() (BeginReload() done), not under C: the
  // bridge call, EndReload(), then the log and the report. Throws
  // IOException if a poisoned store's reload failed.
  void Recover(const Plan& plan, const char* what) const;
  // The seqnum getters: Gate(kGetter), errors swallowed, then the cache.
  FIX::SEQNUM CachedSeqNum(const char* what, bool sender) const;
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
  // EnterPoison() under C, then ReportPoison().
  void Poison(Factory::Method method, const std::string& why,
              bool timedOut) const;
  // The session-log event and 'storeError' of a store just poisoned. Not
  // under C.
  void ReportPoison(Factory::Method method, const std::string& why) const;
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
  // Refuse set(seq) while an earlier setMessage(seq) that timed out has not
  // settled (its write could still land over this one): reports a
  // non-poisoning 'storeError' and throws IOException.
  void CheckUnsettledSet(FIX::SEQNUM seq) const;

  Factory& factory_;
  FIX::SessionID id_;
  mutable std::mutex mtx_;  // C
  mutable FIX::MemoryStore cache_;
  // Written only by the transitions above.
  mutable Health health_ = Health::kOk;
  // kResetPending: the failed reset's timestamp, which its retry reuses.
  mutable FIX::UtcTimeStamp resetTime_ = FIX::UtcTimeStamp::now();
  // "<method>: <why>" of the failure that keeps the store poisoned; empty
  // while kOk.
  mutable std::string lastError_;
  // A reload step runs through the bridge with C released: one at a time.
  // Orthogonal to health_, since refresh() reloads a healthy store too.
  mutable bool reloadInFlight_ = false;
  // Timed-out setSeqNums/reset/create calls, and reload load()s, whose
  // Promise has not settled yet: the poison cannot lift while one is pending
  // (a write may still land; a reload would stack on a stalled one). Written
  // by CountUnsettled() only, which documents why it may read -1.
  mutable int unsettled_ = 0;
  // Timed-out setMessage calls whose Promise has not settled, counted per
  // seqnum: set(N) is refused while unsettledSets_[N] > 0 (CheckUnsettledSet()).
  // Not part of the poison. Written by CountUnsettled() only; an entry is
  // erased at 0.
  mutable std::map<FIX::SEQNUM, int> unsettledSets_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_JS_MESSAGE_STORE_H
