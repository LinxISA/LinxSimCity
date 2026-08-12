#pragma once

#include "linxsimcity/trace/event.h"
#include "linxsimcity/trace/topology.h"

#include <cstdint>

namespace linxsimcity::trace {

class TraceSink {
public:
  virtual ~TraceSink() = default;
  virtual void SetTopology(TopologyDescriptor topology) = 0;
  virtual void BeginCycle(std::uint64_t cycle) = 0;
  virtual void Emit(Event event) = 0;
  virtual void EndCycle() = 0;
  virtual void Close() = 0;
};

class NullTraceSink final : public TraceSink {
public:
  void SetTopology(TopologyDescriptor) override {}
  void BeginCycle(std::uint64_t) override {}
  void Emit(Event) override {}
  void EndCycle() override {}
  void Close() override {}
};

} // namespace linxsimcity::trace
