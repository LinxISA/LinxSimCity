#pragma once

#include <cstdint>
#include <string>

namespace linxsimcity::trace {

struct Event {
  std::uint64_t cycle{0};
  std::uint64_t seq{0};
  std::string type;
  std::string scope;
  std::string entityId;
  std::string payloadJson{"{}"};
};

} // namespace linxsimcity::trace
