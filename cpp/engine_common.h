#ifndef NAPI_QUICKFIX_ENGINE_COMMON_H
#define NAPI_QUICKFIX_ENGINE_COMMON_H

#include <napi.h>

#include <string>

#include "quickfix/Log.h"

#include "application_bridge.h"

namespace napi_quickfix {

// A LogFactory that produces no-op NullLog instances, for log:'none'. QuickFIX
// ships NullLog but no public NullLogFactory, so we provide one.
class NullLogFactory : public FIX::LogFactory {
 public:
  FIX::Log* create() override { return new FIX::NullLog(); }
  FIX::Log* create(const FIX::SessionID&) override { return new FIX::NullLog(); }
  void destroy(FIX::Log* log) override { delete log; }
};

// engine.setCallbackEnabled(name: 'onCreate' | ... | 'fromApp', enabled: boolean)
// Shared body of the InitiatorWrap / AcceptorWrap method: flips the bridge's
// forwarding switch for one callback (see ApplicationBridge::SetCallbackEnabled).
inline Napi::Value SetCallbackEnabledImpl(const Napi::CallbackInfo& info,
                                          ApplicationBridge* bridge) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsString()) {
    throw Napi::TypeError::New(
        env, "setCallbackEnabled(name: string, enabled: boolean)");
  }
  const std::string name = info[0].As<Napi::String>().Utf8Value();
  ApplicationBridge::CallType type;
  if (!ApplicationBridge::CallTypeFromName(name, type)) {
    throw Napi::TypeError::New(env, "unknown callback: " + name);
  }
  if (bridge) {
    bridge->SetCallbackEnabled(type, info[1].ToBoolean().Value());
  }
  return env.Undefined();
}

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_ENGINE_COMMON_H
