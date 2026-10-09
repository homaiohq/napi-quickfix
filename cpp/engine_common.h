#ifndef NAPI_QUICKFIX_ENGINE_COMMON_H
#define NAPI_QUICKFIX_ENGINE_COMMON_H

#include <set>
#include <string>

#include "quickfix/Exceptions.h"
#include "quickfix/Log.h"
#include "quickfix/Session.h"
#include "quickfix/SessionID.h"
#include "quickfix/SessionSettings.h"

namespace napi_quickfix {

// Throw ConfigError("Duplicate Session ...") if any [SESSION] of `settings`
// that an engine of `connectionType` ("initiator" / "acceptor") would create
// already has a live FIX::Session in this process. QuickFIX only rejects
// duplicates within ONE settings object (SessionSettings::set); across engines
// its Session constructor ignores addSession()'s result, so a second engine
// would silently shadow the first in the process-wide registry that
// lookupSession()/sendToTarget() read, and the per-engine SessionOpGate
// registry would couple operations with the wrong engine. Call it on the JS
// thread right before constructing the engine: engines are only created and
// destroyed on that thread, so the check cannot race another engine.
inline void RejectDuplicateSessions(const FIX::SessionSettings& settings,
                                    const std::string& connectionType) {
  for (const FIX::SessionID& id : settings.getSessions()) {
    const FIX::Dictionary& dict = settings.get(id);
    // Sessions of the other type are skipped by the engine (and a missing
    // ConnectionType is its own ConfigError, raised by the engine itself).
    if (!dict.has("ConnectionType") ||
        dict.getString("ConnectionType") != connectionType) {
      continue;
    }
    if (FIX::Session::doesSessionExist(id)) {
      throw FIX::ConfigError("Duplicate Session " + id.toString());
    }
  }
}

// Delete the FIX::Session objects a FAILED engine constructor left behind.
// FIX::Initiator/Acceptor::initialize() creates one FIX::Session per [SESSION]
// of its connection type, registering each in the process-wide registry, and
// if a later [SESSION] throws ConfigError the constructor unwinds WITHOUT the
// engine destructor that would delete them: they stay registered with no
// owner, so lookupSession() keeps resolving them and every later engine with
// one of those ids is rejected as a duplicate for the rest of the process.
// Call it right after the engine constructor threw, on the JS thread, with
// the same `settings`/`connectionType` RejectDuplicateSessions() was called
// with just before: that check guarantees every session of ours that exists
// now was created by the failed constructor, and each one is fully
// constructed: the only callback FIX::Session's constructor makes after
// registering itself is onCreate, which the bridge dispatches fire-and-forget
// (a throwing JS handler never unwinds the constructor). ~Session unregisters
// it and destroys its store/log through the factories the wrap still owns
// (public virtual destructor; the engine destructor does exactly this
// `delete`).
inline void DestroyOrphanedSessions(const FIX::SessionSettings& settings,
                                    const std::string& connectionType) {
  for (const FIX::SessionID& id : settings.getSessions()) {
    const FIX::Dictionary& dict = settings.get(id);
    if (!dict.has("ConnectionType") ||
        dict.getString("ConnectionType") != connectionType) {
      continue;
    }
    delete FIX::Session::lookupSession(id);  // nullptr-safe
  }
}

// A LogFactory that produces no-op NullLog instances, for log:'none'. QuickFIX
// ships NullLog but no public NullLogFactory, so we provide one.
class NullLogFactory : public FIX::LogFactory {
 public:
  FIX::Log* create() override { return new FIX::NullLog(); }
  FIX::Log* create(const FIX::SessionID&) override { return new FIX::NullLog(); }
  void destroy(FIX::Log* log) override { delete log; }
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_ENGINE_COMMON_H
