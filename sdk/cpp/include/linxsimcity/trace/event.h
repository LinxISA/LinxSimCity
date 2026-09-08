#pragma once

#include <cstdint>
#include <optional>
#include <string>

namespace linxsimcity::trace {

struct Event {
  std::string timeDomain;
  std::uint64_t cycle{0};
  std::string phase;
  std::optional<std::uint64_t> sequence;
  std::string type;
  std::string entityId;
  std::string payloadJson{"{}"};
};

} // namespace linxsimcity::trace
