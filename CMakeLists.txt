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

# Upstream fixes carried until QuickFIX ships them, applied to the fetched
# sources at configure time rather than as a FetchContent PATCH_COMMAND: that
# step is skipped for a source tree restored from a cache or given through
# FETCHCONTENT_SOURCE_DIR_QUICKFIX. Each edit replaces one whole anchor line
# (single-line anchors survive a CRLF checkout), is idempotent, and rewrites
# the file only when it changes (no needless rebuild). When the pin moves, every
# anchor must still be found exactly once or the configure fails: drop the edit
# if the new release has the fix, otherwise re-anchor it.
function(qf_patch file what unpatched patched)
  set(_path "${quickfix_SOURCE_DIR}/src/C++/${file}")
  file(READ "${_path}" _source)
  string(FIND "${_source}" "${patched}" _at)
  if(NOT _at EQUAL -1)
    return()
  endif()
  string(FIND "${_source}" "${unpatched}" _at)
  string(FIND "${_source}" "${unpatched}" _last REVERSE)
  if(_at EQUAL -1 OR NOT _at EQUAL _last)
    message(FATAL_ERROR
      "${_path}: the line the ${what} patch applies to was not found exactly "
      "once. See the comment above qf_patch() in CMakeLists.txt.")
  endif()
  string(REPLACE "${unpatched}" "${patched}" _source "${_source}")
  file(WRITE "${_path}" "${_source}")
  message(STATUS "QuickFIX: patched ${file} (${what})")
endfunction()

# 1. Never generate a Logon for a session that has no connection.
# Session::disconnect() only queues the socket for SocketMonitor::drop(), and
# SocketInitiator::onStart() calls onTimeout() after every block(), before the
# drop is processed, so a session just disconnected by an inbound message (a
# peer's Logout, a store failure) is ticked once more with no responder and
# sentLogon cleared: Session::next() generates a Logon, sendRaw() persists it
# under a fresh MsgSeqNum and send() drops it, and the real onDisconnect() then
# fires onLogout a second time. test/session.test.ts covers it.
qf_patch(Session.cpp "no-responder Logon"
  "if (m_state.shouldSendLogon() && isLogonTime(now)) {"
  "if (m_state.shouldSendLogon() && isLogonTime(now) && m_pResponder) {")

# 2. Close a dropped socket only once its onError() has been delivered.
# SocketMonitor::drop() closes the fd at once but only queues it for the next
# block(). Anything that opens a socket in between gets the lowest free fd --
# the dropped one: SocketInitiator::onStart() runs onTimeout() after every
# block(), and a reconnect due there files the new socket under that number in
# m_pendingConnections. The queued onDisconnect(fd) then tears down the new
# connection (the pending entry wins, SocketInitiator.cpp:201-206) and never
# calls setDisconnected() for the dropped session, which stays in
# Initiator::m_connected and is never redialled: its sends are stored, never
# delivered. A SocketAcceptor's accept() can reuse the fd the same way. Any
# disconnect raised while handling data (a peer's Logout, a RejectLogon, a store
# IOException) in the same pass as another session's due reconnect hits it; a
# store call that stalls the network thread past ReconnectInterval makes it
# near-certain. The fd now stays open, unmonitored, until block() has delivered
# its onError(), and the destructor closes drops still queued. Both platform
# files are patched (only one is compiled). test/reconnect.test.ts covers it.
foreach(_qf_monitor SocketMonitor_UNIX.cpp SocketMonitor_WIN32.cpp)
  qf_patch(${_qf_monitor} "deferred close: drop()"
    "    socket_close(s);"
    "    // socket_close(s) deferred to block(), after onError(s): see CMakeLists.txt")
  qf_patch(${_qf_monitor} "deferred close: block()"
    "    strategy.onError(*this, m_dropped.front());"
    "    strategy.onError(*this, m_dropped.front()); socket_close(m_dropped.front());")
  qf_patch(${_qf_monitor} "deferred close: destructor"
    "  socket_close(m_signal);"
    "  for (; m_dropped.size(); m_dropped.pop()) { socket_close(m_dropped.front()); } socket_close(m_signal);")
endforeach()

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
# CONFIGURE_DEPENDS re-globs on every build, so adding or deleting a cpp/*.cpp
# file is picked up by an already-configured tree. cmake-js only re-runs the
# configure step when CMakeCache.txt is missing, so without it a deleted source
# stays in the build graph until `yarn clean`.
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
  NODE_API_SWALLOW_UNTHROWABLE_EXCEPTIONS  # see the trampoline in cpp/application_bridge.cpp
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
