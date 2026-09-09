#pragma once

#include "linxsimcity/trace/event.h"
namespace linxsimcity::trace {

class TraceSink {
public:
  virtual ~TraceSink() = default;
  virtual void Emit(Event event) = 0;
  virtual void Close() = 0;
};

class NullTraceSink final : public TraceSink {
public:
  void Emit(Event) override {}
  void Close() override {}
};

} // namespace linxsimcity::trace
