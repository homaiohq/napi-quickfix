#ifndef NAPI_QUICKFIX_DATA_DICTIONARY_WRAP_H
#define NAPI_QUICKFIX_DATA_DICTIONARY_WRAP_H

#include <napi.h>

#include "quickfix/DataDictionary.h"

namespace napi_quickfix {

// Napi::ObjectWrap over FIX::DataDictionary.
//
//   DataDictionary.fromFile(path): DataDictionary
//   DataDictionary.fromString(xml): DataDictionary
//   dd.validate(message: Message): void   (throws QuickFixError if invalid)
class DataDictionaryWrap : public Napi::ObjectWrap<DataDictionaryWrap> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);

  explicit DataDictionaryWrap(const Napi::CallbackInfo& info);

  FIX::DataDictionary& Dictionary() { return dict_; }
  const FIX::DataDictionary& Dictionary() const { return dict_; }

  // Unwrap a JS value that must be a DataDictionaryWrap; throws
  // Napi::TypeError if not.
  static DataDictionaryWrap* UnwrapArg(Napi::Env env, Napi::Value value,
                                       const char* argName);

 private:
  static Napi::FunctionReference constructor_;

  static Napi::Value FromFile(const Napi::CallbackInfo& info);
  static Napi::Value FromString(const Napi::CallbackInfo& info);

  Napi::Value Validate(const Napi::CallbackInfo& info);

  FIX::DataDictionary dict_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_DATA_DICTIONARY_WRAP_H
