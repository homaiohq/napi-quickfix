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
file(GLOB ADDON_SOURCES "${CMAKE_SOURCE_DIR}/cpp/*.cpp")

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
