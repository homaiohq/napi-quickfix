// C++ -> Napi::Error translation for the QuickFIX wrapper.
//
// Every wrapper method funnels caught exceptions through here so that JS sees a
// consistent Error shape:
//   - name:     "QuickFixError"
//   - message:  the exception's what()
//   - fixError: a discriminator string. For FIX::Exception this is its `.type`
//               (e.g. "Field not found: 35", "Configuration failed", ...) which
//               is stable per concrete type; we ALSO set fixErrorName to the C++
//               class name (e.g. "FieldNotFound") which is the value TS keys on.
//   - detail:   the exception's `.detail` when available.
//
// NAPI_CPP_EXCEPTIONS is enabled, so throwing a Napi::Error unwinds into a JS
// throw at the call boundary.
#ifndef NAPI_QUICKFIX_ERRORS_H
#define NAPI_QUICKFIX_ERRORS_H

#include <napi.h>

#include <exception>
#include <string>

#include "quickfix/Exceptions.h"

namespace napi_quickfix {

// Map a concrete FIX::Exception to a stable class-name discriminator. QuickFIX
// exceptions don't carry RTTI-friendly names, so we dynamic_cast the well-known
// concrete types (order: most-specific first is not required since they don't
// inherit from each other beyond Exception).
inline const char* FixErrorName(const FIX::Exception& e) {
  if (dynamic_cast<const FIX::ConfigError*>(&e)) return "ConfigError";
  if (dynamic_cast<const FIX::RuntimeError*>(&e)) return "RuntimeError";
  if (dynamic_cast<const FIX::FieldNotFound*>(&e)) return "FieldNotFound";
  if (dynamic_cast<const FIX::FieldConvertError*>(&e)) return "FieldConvertError";
  if (dynamic_cast<const FIX::MessageParseError*>(&e)) return "MessageParseError";
  if (dynamic_cast<const FIX::InvalidMessage*>(&e)) return "InvalidMessage";
  if (dynamic_cast<const FIX::IncorrectDataFormat*>(&e)) return "IncorrectDataFormat";
  if (dynamic_cast<const FIX::IncorrectTagValue*>(&e)) return "IncorrectTagValue";
  if (dynamic_cast<const FIX::IncorrectMessageStructure*>(&e)) return "IncorrectMessageStructure";
  if (dynamic_cast<const FIX::InvalidTagNumber*>(&e)) return "InvalidTagNumber";
  if (dynamic_cast<const FIX::RequiredTagMissing*>(&e)) return "RequiredTagMissing";
  if (dynamic_cast<const FIX::TagNotDefinedForMessage*>(&e)) return "TagNotDefinedForMessage";
  if (dynamic_cast<const FIX::NoTagValue*>(&e)) return "NoTagValue";
  if (dynamic_cast<const FIX::DuplicateFieldNumber*>(&e)) return "DuplicateFieldNumber";
  if (dynamic_cast<const FIX::InvalidMessageType*>(&e)) return "InvalidMessageType";
  if (dynamic_cast<const FIX::UnsupportedMessageType*>(&e)) return "UnsupportedMessageType";
  if (dynamic_cast<const FIX::UnsupportedVersion*>(&e)) return "UnsupportedVersion";
  if (dynamic_cast<const FIX::TagOutOfOrder*>(&e)) return "TagOutOfOrder";
  if (dynamic_cast<const FIX::RepeatedTag*>(&e)) return "RepeatedTag";
  if (dynamic_cast<const FIX::RepeatingGroupCountMismatch*>(&e)) return "RepeatingGroupCountMismatch";
  if (dynamic_cast<const FIX::DoNotSend*>(&e)) return "DoNotSend";
  if (dynamic_cast<const FIX::RejectLogon*>(&e)) return "RejectLogon";
  if (dynamic_cast<const FIX::SessionNotFound*>(&e)) return "SessionNotFound";
  if (dynamic_cast<const FIX::DataDictionaryNotFound*>(&e)) return "DataDictionaryNotFound";
  if (dynamic_cast<const FIX::IOException*>(&e)) return "IOException";
  if (dynamic_cast<const FIX::SocketException*>(&e)) return "SocketException";
  return "FixException";
}

// Build (but do not throw) a Napi::Error from a FIX::Exception.
inline Napi::Error MakeFixError(Napi::Env env, const FIX::Exception& e) {
  Napi::Error err = Napi::Error::New(env, e.what());
  err.Set("name", Napi::String::New(env, "QuickFixError"));
  err.Set("fixError", Napi::String::New(env, e.type));
  err.Set("fixErrorName", Napi::String::New(env, FixErrorName(e)));
  err.Set("detail", Napi::String::New(env, e.detail));
  return err;
}

// Build (but do not throw) a Napi::Error from a generic std::exception.
inline Napi::Error MakeStdError(Napi::Env env, const std::exception& e) {
  Napi::Error err = Napi::Error::New(env, e.what());
  err.Set("name", Napi::String::New(env, "QuickFixError"));
  err.Set("fixErrorName", Napi::String::New(env, "Error"));
  return err;
}

// A plain-data capture of an exception's mapped fields, safe to carry across
// threads (an AsyncWorker's Execute() runs off the JS thread and MUST NOT touch
// Napi/JS). Populate it in a catch block on the worker thread, then rebuild a
// Napi::Error from it in OnError/OnOK (which run on the JS thread).
struct CapturedError {
  bool has = false;
  bool isFix = false;
  std::string message;       // what()
  std::string fixError;      // FIX::Exception::type (for FIX exceptions)
  std::string fixErrorName;  // stable class-name discriminator
  std::string detail;        // FIX::Exception::detail

  void Capture(const std::exception& e) {
    has = true;
    message = e.what();
    if (const auto* fe = dynamic_cast<const FIX::Exception*>(&e)) {
      isFix = true;
      fixError = fe->type;
      fixErrorName = FixErrorName(*fe);
      detail = fe->detail;
    } else {
      isFix = false;
      fixErrorName = "Error";
    }
  }

  // Build (do not throw) a Napi::Error from the captured fields.
  Napi::Error ToError(Napi::Env env) const {
    Napi::Error err = Napi::Error::New(env, message);
    err.Set("name", Napi::String::New(env, "QuickFixError"));
    if (isFix) {
      err.Set("fixError", Napi::String::New(env, fixError));
      err.Set("fixErrorName", Napi::String::New(env, fixErrorName));
      err.Set("detail", Napi::String::New(env, detail));
    } else {
      err.Set("fixErrorName", Napi::String::New(env, fixErrorName));
    }
    return err;
  }
};

// Translate a caught exception and throw the corresponding Napi::Error. Callers
// use this inside a catch block, e.g.:
//   try { ... } catch (const std::exception& e) { TranslateAndThrow(env, e); }
[[noreturn]] inline void TranslateAndThrow(Napi::Env env, const std::exception& e) {
  if (const auto* fe = dynamic_cast<const FIX::Exception*>(&e)) {
    throw MakeFixError(env, *fe);
  }
  throw MakeStdError(env, e);
}

}  // namespace napi_quickfix

// Wrap a QuickFIX-calling body so any std::exception is converted to a JS throw.
// Usage:
//   NQ_TRY(env) { ...quickfix calls that may throw... } NQ_CATCH(env)
// The body may `return` a Napi::Value normally.
#define NQ_TRY(env) try
#define NQ_CATCH(env)                                                    \
  catch (const std::exception& _nq_e) {                                  \
    ::napi_quickfix::TranslateAndThrow((env), _nq_e);                    \
  }

#endif  // NAPI_QUICKFIX_ERRORS_H
