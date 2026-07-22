#include "engine_common.h"

// This translation unit exists so engine_common.h's out-of-line vtable anchor
// (NullLogFactory) has a home and to keep the header include-only elsewhere.
// All methods are currently inline in the header; nothing else is needed here.
