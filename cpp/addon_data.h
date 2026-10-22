// Per-environment addon state: the constructors of the exported classes.
// Init runs once per environment (main thread plus every Worker), so a static
// FunctionReference would be overwritten by each and released from the wrong
// thread. See ARCHITECTURE.md.
#ifndef NAPI_QUICKFIX_ADDON_DATA_H
#define NAPI_QUICKFIX_ADDON_DATA_H

#include <napi.h>

namespace napi_quickfix {

struct AddonData {
  Napi::FunctionReference message;
  Napi::FunctionReference group;
  Napi::FunctionReference sessionID;
  Napi::FunctionReference sessionSettings;
  Napi::FunctionReference dataDictionary;
  Napi::FunctionReference session;
  Napi::FunctionReference initiator;
  Napi::FunctionReference acceptor;

  // Module Init only. Node deletes the instance at environment teardown,
  // after the wraps' own finalizers.
  static void Install(Napi::Env env) { env.SetInstanceData(new AddonData()); }

  static AddonData& Get(Napi::Env env) {
    return *env.GetInstanceData<AddonData>();
  }
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_ADDON_DATA_H
