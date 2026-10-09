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
