#ifndef NAPI_QUICKFIX_ENGINE_COMMON_H
#define NAPI_QUICKFIX_ENGINE_COMMON_H

#include "quickfix/Log.h"

namespace napi_quickfix {

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
