#pragma once

#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <utility>
#include <variant>
#include <vector>

namespace linxsimcity::trace {

using TopologyValue =
    std::variant<std::int64_t, std::uint64_t, double, std::string, bool>;

struct TopologyPort {
  std::string id;
  std::string direction;
  std::optional<std::uint64_t> widthBytes;
};

struct TopologyPlacement {
  std::string district;
  std::optional<std::uint64_t> order;
  std::optional<std::uint64_t> row;
  std::optional<std::uint64_t> column;
};

struct TopologyEntity {
  std::string id;
  std::string kind;
  std::string label;
  std::optional<std::string> parentId;
  std::map<std::string, TopologyValue> instance;
  std::optional<std::uint64_t> capacity;
  std::vector<TopologyPort> ports;
  std::optional<TopologyPlacement> placement;
  std::map<std::string, TopologyValue> attributes;
};

struct TopologyDescriptor {
  std::string schemaVersion{"1.0.0"};
  std::vector<TopologyEntity> entities;
};

class TopologyBuilder {
public:
  TopologyBuilder &AddEntity(TopologyEntity entity) {
    topology_.entities.push_back(std::move(entity));
    return *this;
  }

  TopologyDescriptor Build() const { return topology_; }

private:
  TopologyDescriptor topology_;
};

} // namespace linxsimcity::trace
