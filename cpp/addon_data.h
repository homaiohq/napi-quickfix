// Per-environment addon state: the constructors of the exported classes.
// Init runs once per environment (main thread plus every Worker), so a static
// FunctionReference would be overwritten by each and released from the wrong
// thread. See ARCHITECTURE.md.
#ifndef NAPI_QUICKFIX_ADDON_DATA_H
#define NAPI_QUICKFIX_ADDON_DATA_H

#include <napi.h>

#include <set>

namespace napi_quickfix {

// An engine wrap, as the process-exit path sees it (see PrepareExit in
// addon.cpp). PrepareExit() runs on the JS thread from process.on('exit'),
// which fires BEFORE Node joins the libuv threadpool and skips the
// environment cleanup hooks: it must only release what a pool or network
// thread may be parked on, without blocking, joining or touching a TSFN.
class ExitParticipant {
 public:
  virtual void PrepareExit() = 0;

 protected:
  ~ExitParticipant() = default;
};

struct AddonData {
  Napi::FunctionReference message;
  Napi::FunctionReference group;
  Napi::FunctionReference sessionID;
  Napi::FunctionReference sessionSettings;
  Napi::FunctionReference dataDictionary;
  Napi::FunctionReference session;
  Napi::FunctionReference initiator;
  Napi::FunctionReference acceptor;

  // The engine wraps alive in this environment: each adds itself at the end
  // of its constructor and removes itself in its destructor. JS thread only.
  std::set<ExitParticipant*> engines;

  // Module Init only. Node deletes the instance at environment teardown,
  // after the wraps' own finalizers.
  static void Install(Napi::Env env) { env.SetInstanceData(new AddonData()); }

  static AddonData& Get(Napi::Env env) {
    return *env.GetInstanceData<AddonData>();
  }
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_ADDON_DATA_H
