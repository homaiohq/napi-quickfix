// Per-environment addon state: the constructors of the exported classes.
//
// Node loads a context-aware addon once per environment, so with
// worker_threads the module's Init runs once on the main thread and once in
// every Worker that imports it. A `static Napi::FunctionReference` shared by
// those runs is a reference into ONE environment overwritten by the next:
// assigning the new reference deletes the previous one from the wrong thread
// (a cross-isolate global-handle release when the previous owner is the main
// thread, a use-after-free when it is a Worker that has already exited), and
// a wrap on the main thread then builds its instances from a reference into a
// dead environment. Keeping the references in instance data gives each
// environment its own set, released by Node when that environment goes away.
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

  // Install a fresh instance for `env`; module Init only. Node deletes it
  // (through the default finalizer SetInstanceData registers) when the
  // environment is torn down, after the wraps' own finalizers have run.
  static void Install(Napi::Env env) { env.SetInstanceData(new AddonData()); }

  // The instance of the environment the call runs in.
  static AddonData& Get(Napi::Env env) {
    return *env.GetInstanceData<AddonData>();
  }
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_ADDON_DATA_H
