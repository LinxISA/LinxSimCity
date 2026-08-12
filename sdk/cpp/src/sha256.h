#pragma once

#include <string>
#include <string_view>

namespace linxsimcity::trace::internal {

std::string Sha256(std::string_view input);

} // namespace linxsimcity::trace::internal
