#pragma once

#include <array>
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
using TopologyVector3 = std::array<double, 3>;

struct TopologyDistrict {
  std::string id;
  TopologyVector3 position;
  TopologyVector3 size;
};

struct TopologyLayout {
  std::string schema{"linx-city-v1"};
  std::string units{"scene-unit"};
  std::string upAxis{"y"};
  std::string forwardAxis{"-z"};
  std::vector<TopologyDistrict> districts;
};

struct TopologyPort {
  std::string id;
  std::string direction;
  std::optional<std::uint64_t> widthBytes;
  std::optional<TopologyVector3> position;
};

struct TopologyPlacement {
  std::string district;
  std::optional<std::uint64_t> thread;
  std::optional<TopologyVector3> position;
  std::optional<TopologyVector3> size;
  std::optional<TopologyVector3> rotation;
  std::optional<std::uint64_t> order;
  std::optional<std::uint64_t> row;
  std::optional<std::uint64_t> column;
  std::optional<std::string> lodGroup;
};

struct TopologyRoute {
  std::string style{"orthogonal"};
  std::string fromPortId;
  std::string toPortId;
  std::vector<TopologyVector3> points;
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
  std::optional<TopologyRoute> route;
  std::map<std::string, TopologyValue> attributes;
};

struct TopologyDescriptor {
  std::string schemaVersion{"1.0.0"};
  std::optional<TopologyLayout> layout;
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
