#pragma once

#include "linxsimcity/trace/trace_sink.h"

#include <cstdint>
#include <filesystem>
#include <memory>
#include <stdexcept>
#include <string>

namespace linxsimcity::trace {

class TraceOrderError : public std::logic_error {
public:
  using std::logic_error::logic_error;
};

struct WriterOptions {
  std::filesystem::path outputDirectory;
  std::string profile{"pipeline"};
  std::uint64_t chunkCycleSpan{4096};
  std::uint64_t checkpointCycleSpan{4096};
};

class BundleWriter final : public TraceSink {
public:
  explicit BundleWriter(WriterOptions options);
  ~BundleWriter() override;

  BundleWriter(const BundleWriter &) = delete;
  BundleWriter &operator=(const BundleWriter &) = delete;
  BundleWriter(BundleWriter &&) noexcept;
  BundleWriter &operator=(BundleWriter &&) = delete;

  void SetTopology(TopologyDescriptor topology) override;
  void BeginCycle(std::uint64_t cycle) override;
  void Emit(Event event) override;
  void EndCycle() override;
  void Close() override;

private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

} // namespace linxsimcity::trace
