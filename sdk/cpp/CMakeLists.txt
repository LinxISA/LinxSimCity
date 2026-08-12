cmake_minimum_required(VERSION 3.20)
project(LinxSimCityTrace VERSION 0.1.0 LANGUAGES CXX)

include(CTest)
include(CMakePackageConfigHelpers)
include(GNUInstallDirs)
find_package(ZLIB REQUIRED)

find_path(RAPIDJSON_INCLUDE_DIR rapidjson/document.h)
if(NOT RAPIDJSON_INCLUDE_DIR)
  include(FetchContent)
  FetchContent_Declare(
    rapidjson
    URL https://github.com/Tencent/rapidjson/archive/refs/tags/v1.1.0.tar.gz
    URL_HASH SHA256=bf7ced29704a1e696fbccf2a2b4ea068e7774fa37f6d7dd4039d0787f8bed98e
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
    SOURCE_SUBDIR cmake-not-used
  )
  FetchContent_MakeAvailable(rapidjson)
  set(RAPIDJSON_INCLUDE_DIR "${rapidjson_SOURCE_DIR}/include")
endif()

add_library(linxsimcity_trace_sdk
  src/bundle_writer.cpp
  src/sha256.cpp
)
add_library(LinxSimCity::trace_sdk ALIAS linxsimcity_trace_sdk)
set_target_properties(linxsimcity_trace_sdk PROPERTIES
  EXPORT_NAME trace_sdk
  OUTPUT_NAME linxsimcity_trace_sdk
)
target_compile_features(linxsimcity_trace_sdk PUBLIC cxx_std_17)
target_include_directories(linxsimcity_trace_sdk
  PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>
)
target_include_directories(linxsimcity_trace_sdk SYSTEM PRIVATE "${RAPIDJSON_INCLUDE_DIR}")
target_link_libraries(linxsimcity_trace_sdk PUBLIC ZLIB::ZLIB)

add_executable(write_synthetic examples/write_synthetic.cpp)
target_compile_features(write_synthetic PRIVATE cxx_std_17)
target_link_libraries(write_synthetic PRIVATE LinxSimCity::trace_sdk)

if(BUILD_TESTING)
  add_executable(bundle_writer_test tests/bundle_writer_test.cpp)
  target_compile_features(bundle_writer_test PRIVATE cxx_std_17)
  target_include_directories(bundle_writer_test PRIVATE include src)
  target_include_directories(bundle_writer_test SYSTEM PRIVATE "${RAPIDJSON_INCLUDE_DIR}")
  target_link_libraries(bundle_writer_test PRIVATE LinxSimCity::trace_sdk ZLIB::ZLIB)
  add_test(NAME bundle_writer_test COMMAND bundle_writer_test)
endif()

configure_package_config_file(
  cmake/LinxSimCityTraceConfig.cmake.in
  "${CMAKE_CURRENT_BINARY_DIR}/LinxSimCityTraceConfig.cmake"
  INSTALL_DESTINATION "${CMAKE_INSTALL_LIBDIR}/cmake/LinxSimCityTrace"
)
write_basic_package_version_file(
  "${CMAKE_CURRENT_BINARY_DIR}/LinxSimCityTraceConfigVersion.cmake"
  VERSION "${PROJECT_VERSION}"
  COMPATIBILITY SameMajorVersion
)

install(TARGETS linxsimcity_trace_sdk
  EXPORT LinxSimCityTraceTargets
  ARCHIVE DESTINATION "${CMAKE_INSTALL_LIBDIR}"
  LIBRARY DESTINATION "${CMAKE_INSTALL_LIBDIR}"
  RUNTIME DESTINATION "${CMAKE_INSTALL_BINDIR}"
  INCLUDES DESTINATION "${CMAKE_INSTALL_INCLUDEDIR}"
)
install(DIRECTORY include/ DESTINATION "${CMAKE_INSTALL_INCLUDEDIR}")
install(EXPORT LinxSimCityTraceTargets
  FILE LinxSimCityTraceTargets.cmake
  NAMESPACE LinxSimCity::
  DESTINATION "${CMAKE_INSTALL_LIBDIR}/cmake/LinxSimCityTrace"
)
install(FILES
  "${CMAKE_CURRENT_BINARY_DIR}/LinxSimCityTraceConfig.cmake"
  "${CMAKE_CURRENT_BINARY_DIR}/LinxSimCityTraceConfigVersion.cmake"
  DESTINATION "${CMAKE_INSTALL_LIBDIR}/cmake/LinxSimCityTrace"
)
