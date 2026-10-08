cmake_minimum_required(VERSION 3.15)

project(napi_quickfix CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

include(FetchContent)

# ---------------------------------------------------------------------------
# QuickFIX (build-time dependency, nothing vendored). Pinned to v1.16.0.
# ---------------------------------------------------------------------------
# Force QuickFIX build options BEFORE MakeAvailable so add_subdirectory picks
# them up from the cache.
set(QUICKFIX_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(QUICKFIX_EXAMPLES OFF CACHE BOOL "" FORCE)
set(QUICKFIX_TESTS OFF CACHE BOOL "" FORCE)
set(HAVE_SSL OFF CACHE BOOL "" FORCE)
set(HAVE_MYSQL OFF CACHE BOOL "" FORCE)
set(HAVE_POSTGRESQL OFF CACHE BOOL "" FORCE)

FetchContent_Declare(
  quickfix
  GIT_REPOSITORY https://github.com/quickfix/quickfix.git
  GIT_TAG v1.16.0
  GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(quickfix)

# Give musl the same clock as glibc. QuickFIX picks its clock in
# src/C++/FieldTypes.cpp:
#     #if defined(_POSIX_SOURCE) || defined(HAVE_GETTIMEOFDAY)   -> gettimeofday, us
#     #elif defined(HAVE_FTIME)                                  -> ftime, ms only
# glibc's <features.h> defines _POSIX_SOURCE whenever _GNU_SOURCE is set (and g++
# always sets it), so glibc takes the gettimeofday branch for free. musl never
# defines _POSIX_SOURCE, and QuickFIX -- although it probes gettimeofday in
# cmake/QuickfixPlatformSettings.cmake -- never propagates HAVE_GETTIMEOFDAY to the
# compiler (it is absent from cmake_config.h.in). musl does get HAVE_FTIME, so it
# lands on the obsolete ftime() branch and is capped at MILLISECOND resolution.
# That is invisible at the default TimestampPrecision=3, but with
# TimestampPrecision=6 a musl build emits .NNN000 where glibc emits true
# microseconds. Forcing the probe result on removes that divergence.
# No-op on glibc, which already takes the first branch.
#
# UNIX-only on purpose: MSVC has no gettimeofday() to point HAVE_GETTIMEOFDAY at, and
# upstream QuickFIX does propagate HAVE_FTIME on Windows (it probes for it in
# src/C++/CMakeLists.txt), so Windows is millisecond-capped by design. The loopback
# test's microsecond-tail assertion is POSIX-gated to match.
if(UNIX AND TARGET quickfix)
  target_compile_definitions(quickfix PRIVATE HAVE_GETTIMEOFDAY)
endif()

# ---------------------------------------------------------------------------
# Include-tree shim (risk #1): QuickFIX ships headers flat in src/C++/*.h but
# code includes them as "quickfix/Message.h". Assemble a quickfix/ include tree
# at configure time (Windows-safe: file copies, no symlinks).
# ---------------------------------------------------------------------------
set(QF_INCLUDE_ROOT "${CMAKE_BINARY_DIR}/qf_include")
file(GLOB QF_HEADERS "${quickfix_SOURCE_DIR}/src/C++/*.h")
foreach(_qf_hdr ${QF_HEADERS})
  get_filename_component(_qf_name "${_qf_hdr}" NAME)
  configure_file("${_qf_hdr}" "${QF_INCLUDE_ROOT}/quickfix/${_qf_name}" COPYONLY)
endforeach()

# Copy any generated config.h (may live in the binary dir after configure).
file(GLOB_RECURSE QF_GENERATED_CONFIG "${quickfix_BINARY_DIR}/*config.h")
foreach(_qf_cfg ${QF_GENERATED_CONFIG})
  get_filename_component(_qf_cfg_name "${_qf_cfg}" NAME)
  configure_file("${_qf_cfg}" "${QF_INCLUDE_ROOT}/quickfix/${_qf_cfg_name}" COPYONLY)
endforeach()

# ---------------------------------------------------------------------------
# node-addon-api include dir (resolved via node).
# ---------------------------------------------------------------------------
execute_process(
  COMMAND node -p "require('node-addon-api').include_dir"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
string(REPLACE "\"" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
string(REPLACE "\n" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})

# ---------------------------------------------------------------------------
# The native addon.
# ---------------------------------------------------------------------------
file(GLOB ADDON_SOURCES CONFIGURE_DEPENDS "${CMAKE_SOURCE_DIR}/cpp/*.cpp")

add_library(napi_quickfix SHARED ${ADDON_SOURCES} ${CMAKE_JS_SRC})
set_target_properties(napi_quickfix PROPERTIES PREFIX "" SUFFIX ".node")

target_include_directories(napi_quickfix PRIVATE
  ${CMAKE_JS_INC}
  ${QF_INCLUDE_ROOT}
  ${quickfix_SOURCE_DIR}/src/C++
  ${NODE_ADDON_API_DIR}
)

target_compile_definitions(napi_quickfix PRIVATE
  NAPI_VERSION=9
  NAPI_CPP_EXCEPTIONS
  NODE_ADDON_API_DISABLE_DEPRECATED
)

target_link_libraries(napi_quickfix PRIVATE ${CMAKE_JS_LIB} quickfix)

if(UNIX AND NOT APPLE)
  find_package(Threads REQUIRED)
  target_link_libraries(napi_quickfix PRIVATE Threads::Threads)
  # Statically absorb libstdc++/libgcc so a prebuild does not pin consumers to the
  # build image's GLIBCXX version. This matters most for musl: docker-node only keeps
  # the newest Alpine bases, so node:22-alpine's GCC keeps advancing (already 15.2 on
  # Alpine 3.24) and a consumer on an older node:22-alpineX.Y would otherwise hit
  # "GLIBCXX_3.4.3x not found". Safe here because the addon is a leaf: C++ exceptions
  # and RTTI never cross out of the .node (Node's addon ABI is C, and QuickFIX is
  # statically linked into this same object), and Node dlopen()s addons RTLD_LOCAL, so
  # the absorbed symbols stay private to this module.
  target_link_options(napi_quickfix PRIVATE -static-libstdc++ -static-libgcc)
endif()

if(APPLE)
  find_package(Threads REQUIRED)
  target_link_libraries(napi_quickfix PRIVATE Threads::Threads)
  target_link_options(napi_quickfix PRIVATE -undefined dynamic_lookup)
endif()

if(WIN32)
  target_link_libraries(napi_quickfix PRIVATE ws2_32)
  target_compile_definitions(napi_quickfix PRIVATE NOMINMAX _WIN32_WINNT=0x0601)
endif()
