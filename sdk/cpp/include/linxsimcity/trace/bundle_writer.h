#pragma once

#include "linxsimcity/trace/trace_sink.h"

#include <cstdint>
#include <filesystem>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace linxsimcity::trace {

class TraceOrderError : public std::logic_error {
public:
  using std::logic_error::logic_error;
};

struct TimeDomain {
  std::string id;
  std::uint64_t tickNumerator{1};
  std::uint64_t tickDenominator{1};
};

struct SimulatorBinding {
  std::string name;
  std::string revision;
  std::string configSha256;
};

struct WorkloadBinding {
  std::string name;
  std::string sha256;
};

struct TraceWindow {
  std::uint64_t firstCycle{0};
  std::uint64_t lastCycle{0};
  bool startsFromReset{true};
  bool complete{true};
};

struct TraceLoss {
  std::uint64_t droppedEvents{0};
  bool truncated{false};
  std::string reason;
};

struct WriterOptions {
  std::filesystem::path outputDirectory;
  std::string runId;
  std::string topologyFingerprint;
  SimulatorBinding simulator;
  WorkloadBinding workload;
  std::string topologyJson;
  std::vector<TimeDomain> timeDomains;
  TraceWindow window;
  std::vector<std::string> capabilities;
  TraceLoss loss;
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

  void Emit(Event event) override;

  // The state JSON must contain exactly the five current reducer state fields.
  void SetCheckpointStateJson(std::string timeDomain, std::uint64_t cycle,
                              std::string stateJson);
  void Close() override;

private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

} // namespace linxsimcity::trace
