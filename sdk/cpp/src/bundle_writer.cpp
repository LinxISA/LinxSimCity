#include "linxsimcity/trace/bundle_writer.h"

#include "sha256.h"

#include <rapidjson/document.h>
#include <rapidjson/stringbuffer.h>
#include <rapidjson/writer.h>
#include <zlib.h>

#include <algorithm>
#include <fstream>
#include <iomanip>
#include <limits>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <type_traits>
#include <unordered_set>
#include <utility>
#include <vector>

namespace linxsimcity::trace {
namespace {

struct ChunkIndexEntry {
  std::string path;
  std::uint64_t firstCycle;
  std::uint64_t lastCycle;
  std::uint64_t eventCount;
  std::uint64_t compressedBytes;
  std::string sha256;
  std::string checkpointPath;
};

struct CheckpointEntry {
  std::uint64_t cycle;
  std::uint64_t seq;
};

std::string NumberedPath(const char *directory, std::uint64_t number,
                         const char *suffix) {
  std::ostringstream path;
  path << directory << '/' << std::setw(6) << std::setfill('0') << number
       << suffix;
  return path.str();
}

void WriteFile(const std::filesystem::path &path, const std::string &content) {
  std::ofstream output(path, std::ios::binary | std::ios::trunc);
  if (!output) {
    throw std::runtime_error("cannot open output file: " + path.string());
  }
  output.write(content.data(), static_cast<std::streamsize>(content.size()));
  if (!output) {
    throw std::runtime_error("cannot write output file: " + path.string());
  }
}

void WriteGzip(const std::filesystem::path &path, const std::string &content) {
  gzFile output = gzopen(path.string().c_str(), "wb");
  if (output == nullptr) {
    throw std::runtime_error("cannot open gzip output: " + path.string());
  }
  std::size_t offset = 0;
  while (offset < content.size()) {
    const auto remaining = content.size() - offset;
    const auto size = static_cast<unsigned>(
        std::min<std::size_t>(remaining, std::numeric_limits<unsigned>::max()));
    if (gzwrite(output, content.data() + offset, size) !=
        static_cast<int>(size)) {
      gzclose(output);
      throw std::runtime_error("cannot write gzip output: " + path.string());
    }
    offset += size;
  }
  if (gzclose(output) != Z_OK) {
    throw std::runtime_error("cannot close gzip output: " + path.string());
  }
}

std::string ReadFile(const std::filesystem::path &path) {
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    throw std::runtime_error("cannot read output file: " + path.string());
  }
  return {std::istreambuf_iterator<char>(input),
          std::istreambuf_iterator<char>()};
}

template <typename Writer>
void WriteTopologyValue(Writer &writer, const TopologyValue &value) {
  std::visit(
      [&writer](const auto &item) {
        using T = std::decay_t<decltype(item)>;
        if constexpr (std::is_same_v<T, std::int64_t>) {
          writer.Int64(item);
        } else if constexpr (std::is_same_v<T, std::uint64_t>) {
          writer.Uint64(item);
        } else if constexpr (std::is_same_v<T, double>) {
          writer.Double(item);
        } else if constexpr (std::is_same_v<T, std::string>) {
          writer.String(item.c_str(),
                        static_cast<rapidjson::SizeType>(item.size()));
        } else {
          writer.Bool(item);
        }
      },
      value);
}

template <typename Writer>
void WriteValueMap(Writer &writer,
                   const std::map<std::string, TopologyValue> &values) {
  writer.StartObject();
  for (const auto &[key, value] : values) {
    writer.Key(key.c_str(), static_cast<rapidjson::SizeType>(key.size()));
    WriteTopologyValue(writer, value);
  }
  writer.EndObject();
}

template <typename Writer>
void WriteVector3(Writer &writer, const TopologyVector3 &value) {
  writer.StartArray();
  for (const auto coordinate : value) {
    writer.Double(coordinate);
  }
  writer.EndArray();
}

std::string SerializeTopology(const TopologyDescriptor &topology) {
  rapidjson::StringBuffer buffer;
  rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
  writer.StartObject();
  writer.Key("schemaVersion");
  writer.String(topology.schemaVersion.c_str());
  if (topology.layout) {
    writer.Key("layout");
    writer.StartObject();
    writer.Key("schema");
    writer.String(topology.layout->schema.c_str());
    writer.Key("units");
    writer.String(topology.layout->units.c_str());
    writer.Key("upAxis");
    writer.String(topology.layout->upAxis.c_str());
    writer.Key("forwardAxis");
    writer.String(topology.layout->forwardAxis.c_str());
    writer.Key("districts");
    writer.StartArray();
    for (const auto &district : topology.layout->districts) {
      writer.StartObject();
      writer.Key("id");
      writer.String(district.id.c_str());
      writer.Key("position");
      WriteVector3(writer, district.position);
      writer.Key("size");
      WriteVector3(writer, district.size);
      writer.EndObject();
    }
    writer.EndArray();
    writer.EndObject();
  }
  writer.Key("entities");
  writer.StartArray();
  for (const auto &entity : topology.entities) {
    writer.StartObject();
    writer.Key("id");
    writer.String(entity.id.c_str());
    writer.Key("kind");
    writer.String(entity.kind.c_str());
    if (entity.parentId) {
      writer.Key("parentId");
      writer.String(entity.parentId->c_str());
    }
    writer.Key("label");
    writer.String(entity.label.c_str());
    writer.Key("instance");
    WriteValueMap(writer, entity.instance);
    if (entity.capacity) {
      writer.Key("capacity");
      writer.Uint64(*entity.capacity);
    }
    if (!entity.ports.empty()) {
      writer.Key("ports");
      writer.StartArray();
      for (const auto &port : entity.ports) {
        writer.StartObject();
        writer.Key("id");
        writer.String(port.id.c_str());
        writer.Key("direction");
        writer.String(port.direction.c_str());
        if (port.widthBytes) {
          writer.Key("widthBytes");
          writer.Uint64(*port.widthBytes);
        }
        if (port.position) {
          writer.Key("position");
          WriteVector3(writer, *port.position);
        }
        writer.EndObject();
      }
      writer.EndArray();
    }
    if (entity.placement) {
      writer.Key("placement");
      writer.StartObject();
      writer.Key("district");
      writer.String(entity.placement->district.c_str());
      if (entity.placement->thread) {
        writer.Key("thread");
        writer.Uint64(*entity.placement->thread);
      }
      if (entity.placement->position) {
        writer.Key("position");
        WriteVector3(writer, *entity.placement->position);
      }
      if (entity.placement->size) {
        writer.Key("size");
        WriteVector3(writer, *entity.placement->size);
      }
      if (entity.placement->rotation) {
        writer.Key("rotation");
        WriteVector3(writer, *entity.placement->rotation);
      }
      if (entity.placement->order) {
        writer.Key("order");
        writer.Uint64(*entity.placement->order);
      }
      if (entity.placement->row) {
        writer.Key("row");
        writer.Uint64(*entity.placement->row);
      }
      if (entity.placement->column) {
        writer.Key("column");
        writer.Uint64(*entity.placement->column);
      }
      if (entity.placement->lodGroup) {
        writer.Key("lodGroup");
        writer.String(entity.placement->lodGroup->c_str());
      }
      writer.EndObject();
    }
    if (entity.route) {
      writer.Key("route");
      writer.StartObject();
      writer.Key("style");
      writer.String(entity.route->style.c_str());
      writer.Key("fromPortId");
      writer.String(entity.route->fromPortId.c_str());
      writer.Key("toPortId");
      writer.String(entity.route->toPortId.c_str());
      writer.Key("points");
      writer.StartArray();
      for (const auto &point : entity.route->points) {
        WriteVector3(writer, point);
      }
      writer.EndArray();
      writer.EndObject();
    }
    if (!entity.attributes.empty()) {
      writer.Key("attributes");
      WriteValueMap(writer, entity.attributes);
    }
    writer.EndObject();
  }
  writer.EndArray();
  writer.EndObject();
  return {buffer.GetString(), buffer.GetSize()};
}

std::string SerializeEvent(const Event &event) {
  rapidjson::Document payload;
  payload.Parse(event.payloadJson.c_str(), event.payloadJson.size());
  if (payload.HasParseError()) {
    throw std::invalid_argument("event payloadJson must contain valid JSON");
  }
  rapidjson::StringBuffer buffer;
  rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
  writer.StartObject();
  writer.Key("cycle");
  writer.Uint64(event.cycle);
  writer.Key("seq");
  writer.Uint64(event.seq);
  writer.Key("type");
  writer.String(event.type.c_str());
  writer.Key("scope");
  writer.String(event.scope.c_str());
  writer.Key("entity_id");
  writer.String(event.entityId.c_str());
  writer.Key("payload");
  payload.Accept(writer);
  writer.EndObject();
  return {buffer.GetString(), buffer.GetSize()};
}

std::string SerializeCheckpoint(std::uint64_t cycle, std::uint64_t seq) {
  rapidjson::StringBuffer buffer;
  rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
  writer.StartObject();
  writer.Key("cycle");
  writer.Uint64(cycle);
  writer.Key("seq");
  writer.Uint64(seq);
  writer.Key("entities");
  writer.StartObject();
  writer.EndObject();
  writer.EndObject();
  return {buffer.GetString(), buffer.GetSize()};
}

} // namespace

class BundleWriter::Impl {
public:
  explicit Impl(WriterOptions writerOptions)
      : options(std::move(writerOptions)) {
    if (options.outputDirectory.empty()) {
      throw std::invalid_argument("outputDirectory must not be empty");
    }
    if (options.chunkCycleSpan == 0 || options.checkpointCycleSpan == 0) {
      throw std::invalid_argument("cycle spans must be positive");
    }
    if (options.profile != "overview" && options.profile != "pipeline" &&
        options.profile != "forensic") {
      throw std::invalid_argument(
          "profile must be overview, pipeline, or forensic");
    }
  }

  void FlushChunk() {
    if (chunkEvents.empty()) {
      return;
    }
    std::filesystem::create_directories(options.outputDirectory / "chunks");
    std::filesystem::create_directories(options.outputDirectory /
                                        "checkpoints");
    const auto number = *chunkNumber;
    const auto chunkPath = NumberedPath("chunks", number, ".jsonl.gz");
    const auto checkpointNumber =
        chunkEvents.front().cycle / options.checkpointCycleSpan;
    const auto checkpointPath =
        NumberedPath("checkpoints", checkpointNumber, ".json.gz");
    std::string content;
    for (const auto &event : chunkEvents) {
      content += SerializeEvent(event);
      content.push_back('\n');
    }
    WriteGzip(options.outputDirectory / chunkPath, content);
    const auto compressed = ReadFile(options.outputDirectory / chunkPath);
    chunks.push_back({chunkPath, chunkEvents.front().cycle,
                      chunkEvents.back().cycle,
                      static_cast<std::uint64_t>(chunkEvents.size()),
                      static_cast<std::uint64_t>(compressed.size()),
                      internal::Sha256(compressed), checkpointPath});
    chunkEvents.clear();
    chunkNumber.reset();
  }

  void ScheduleCheckpoint(const Event &event) {
    const auto number = event.cycle / options.checkpointCycleSpan;
    if (!checkpoints.empty() && checkpoints.rbegin()->first >= number) {
      return;
    }
    auto next = checkpoints.empty() ? number : checkpoints.rbegin()->first;
    if (!checkpoints.empty()) {
      if (next == std::numeric_limits<std::uint64_t>::max()) {
        return;
      }
      ++next;
    }
    for (;;) {
      checkpoints.emplace(
          next, CheckpointEntry{next * options.checkpointCycleSpan, 0});
      if (next == number) {
        break;
      }
      ++next;
    }
  }

  void WriteCheckpoints() const {
    for (const auto &[number, checkpoint] : checkpoints) {
      const auto path = NumberedPath("checkpoints", number, ".json.gz");
      WriteGzip(options.outputDirectory / path,
                SerializeCheckpoint(checkpoint.cycle, checkpoint.seq));
    }
  }

  void WriteManifest() const {
    rapidjson::StringBuffer buffer;
    rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
    writer.StartObject();
    writer.Key("schemaVersion");
    writer.String(topology.schemaVersion.c_str());
    writer.Key("modelVersion");
    writer.String("unknown");
    writer.Key("profile");
    writer.String(options.profile.c_str());
    writer.Key("firstCycle");
    writer.Uint64(firstCycle.value_or(0));
    writer.Key("lastCycle");
    writer.Uint64(lastCycle.value_or(0));
    writer.Key("eventCount");
    writer.Uint64(eventCount);
    writer.Key("chunkCount");
    writer.Uint64(static_cast<std::uint64_t>(chunks.size()));
    writer.Key("chunkCycleSpan");
    writer.Uint64(options.chunkCycleSpan);
    writer.Key("checkpointCycleSpan");
    writer.Uint64(options.checkpointCycleSpan);
    if (!options.capabilities.empty()) {
      writer.Key("capabilities");
      writer.StartArray();
      for (const auto &capability : options.capabilities) {
        writer.String(capability.c_str());
      }
      writer.EndArray();
    }
    writer.EndObject();
    WriteFile(options.outputDirectory / "manifest.json",
              {buffer.GetString(), buffer.GetSize()});
  }

  void WriteIndex() const {
    rapidjson::StringBuffer buffer;
    rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
    writer.StartObject();
    writer.Key("schemaVersion");
    writer.String(topology.schemaVersion.c_str());
    writer.Key("chunks");
    writer.StartArray();
    for (const auto &chunk : chunks) {
      writer.StartObject();
      writer.Key("path");
      writer.String(chunk.path.c_str());
      writer.Key("firstCycle");
      writer.Uint64(chunk.firstCycle);
      writer.Key("lastCycle");
      writer.Uint64(chunk.lastCycle);
      writer.Key("eventCount");
      writer.Uint64(chunk.eventCount);
      writer.Key("compressedBytes");
      writer.Uint64(chunk.compressedBytes);
      writer.Key("sha256");
      writer.String(chunk.sha256.c_str());
      writer.Key("checkpointPath");
      writer.String(chunk.checkpointPath.c_str());
      writer.EndObject();
    }
    writer.EndArray();
    writer.EndObject();
    WriteFile(options.outputDirectory / "index.json",
              {buffer.GetString(), buffer.GetSize()});
  }

  WriterOptions options;
  TopologyDescriptor topology;
  std::unordered_set<std::string> entityIds;
  bool closed{false};
  std::optional<std::uint64_t> currentCycle;
  std::uint64_t nextSeq{0};
  std::optional<std::pair<std::uint64_t, std::uint64_t>> lastOrder;
  std::optional<std::uint64_t> firstCycle;
  std::optional<std::uint64_t> lastCycle;
  std::uint64_t eventCount{0};
  std::optional<std::uint64_t> chunkNumber;
  std::vector<Event> chunkEvents;
  std::vector<ChunkIndexEntry> chunks;
  std::map<std::uint64_t, CheckpointEntry> checkpoints;
};

BundleWriter::BundleWriter(WriterOptions options)
    : impl_(std::make_unique<Impl>(std::move(options))) {}

BundleWriter::~BundleWriter() {
  if (impl_ != nullptr && !impl_->closed) {
    try {
      Close();
    } catch (...) {
    }
  }
}

BundleWriter::BundleWriter(BundleWriter &&) noexcept = default;

void BundleWriter::SetTopology(TopologyDescriptor topology) {
  if (impl_->closed) {
    throw std::logic_error("writer is closed");
  }
  if (impl_->eventCount != 0) {
    throw std::logic_error("topology cannot change after events are emitted");
  }
  std::unordered_set<std::string> entityIds;
  for (const auto &entity : topology.entities) {
    entityIds.insert(entity.id);
  }
  impl_->topology = std::move(topology);
  impl_->entityIds = std::move(entityIds);
}

void BundleWriter::BeginCycle(std::uint64_t cycle) {
  if (impl_->closed) {
    throw std::logic_error("writer is closed");
  }
  if (impl_->currentCycle) {
    throw std::logic_error("EndCycle must be called before BeginCycle");
  }
  impl_->currentCycle = cycle;
  impl_->nextSeq = 0;
}

void BundleWriter::Emit(Event event) {
  if (impl_->closed) {
    throw std::logic_error("writer is closed");
  }
  if (!impl_->currentCycle) {
    throw std::logic_error("BeginCycle must be called before Emit");
  }
  if (event.cycle != *impl_->currentCycle) {
    throw std::invalid_argument("event cycle does not match active cycle");
  }
  if (impl_->entityIds.find(event.entityId) == impl_->entityIds.end()) {
    throw std::invalid_argument("event entityId does not exist in topology: " +
                                event.entityId);
  }
  event.seq = impl_->nextSeq;
  const auto order = std::make_pair(event.cycle, event.seq);
  if (impl_->lastOrder && order <= *impl_->lastOrder) {
    throw TraceOrderError(
        "events must have strictly increasing (cycle, seq) order");
  }
  SerializeEvent(event);

  const auto number = event.cycle / impl_->options.chunkCycleSpan;
  if (impl_->chunkNumber && number != *impl_->chunkNumber) {
    impl_->FlushChunk();
  }
  impl_->ScheduleCheckpoint(event);
  impl_->chunkNumber = number;
  impl_->chunkEvents.push_back(std::move(event));
  impl_->lastOrder = order;
  impl_->firstCycle = impl_->firstCycle.value_or(order.first);
  impl_->lastCycle = order.first;
  ++impl_->eventCount;
  ++impl_->nextSeq;
}

void BundleWriter::EndCycle() {
  if (impl_->closed) {
    throw std::logic_error("writer is closed");
  }
  if (!impl_->currentCycle) {
    throw std::logic_error("BeginCycle must be called before EndCycle");
  }
  impl_->currentCycle.reset();
}

void BundleWriter::Close() {
  if (impl_->closed) {
    return;
  }
  std::filesystem::create_directories(impl_->options.outputDirectory /
                                      "chunks");
  std::filesystem::create_directories(impl_->options.outputDirectory /
                                      "checkpoints");
  impl_->FlushChunk();
  impl_->WriteCheckpoints();
  WriteFile(impl_->options.outputDirectory / "topology.json",
            SerializeTopology(impl_->topology));
  WriteFile(impl_->options.outputDirectory / "strings.json", "{}");
  impl_->WriteManifest();
  impl_->WriteIndex();
  impl_->closed = true;
}

} // namespace linxsimcity::trace
