#include "linxsimcity/trace/bundle_writer.h"

#include "sha256.h"

#include <rapidjson/document.h>
#include <rapidjson/stringbuffer.h>
#include <rapidjson/writer.h>
#include <zlib.h>

#include <algorithm>
#include <array>
#include <fstream>
#include <iomanip>
#include <limits>
#include <map>
#include <optional>
#include <set>
#include <sstream>
#include <stdexcept>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace linxsimcity::trace {
namespace {

constexpr std::uint64_t kMaxSafeInteger = 9007199254740991ULL;
constexpr std::array<const char *, 4> kPhases = {"work", "xfer", "commit",
                                                 "async"};
constexpr std::array<const char *, 4> kCapabilities = {
    "queue-lifecycle", "tile-residency", "instruction-link",
    "compute-lifecycle"};
constexpr std::array<const char *, 16> kEventTypes = {
    "queue.write-attempt", "queue.accept",
    "queue.visible",       "queue.read",
    "queue.backpressure",  "queue.cancel",
    "tile.allocate",       "tile.read",
    "tile.write",          "tile.move",
    "tile.release",        "link.associate",
    "compute.start",       "compute.complete",
    "run.reset",           "run.flush"};

struct StoredEvent {
  Event event;
  std::uint64_t sequence;
  std::uint64_t ordinal;
};

struct OrderKey {
  std::uint64_t cycle;
  unsigned phase;
  std::uint64_t sequence;
};

struct ChunkMeta {
  std::string id;
  std::string path;
  std::string timeDomain;
  std::uint64_t firstCycle;
  std::uint64_t lastCycle;
  std::uint64_t eventCount;
  std::string sha256;
  std::uint64_t compressedBytes;
  std::string checkpointId;
};

struct CheckpointMeta {
  std::string id;
  std::string path;
  std::string timeDomain;
  std::uint64_t cycle;
  std::uint64_t eventOrdinal;
  std::string sha256;
  std::uint64_t compressedBytes;
};

std::string Decimal(std::uint64_t value) { return std::to_string(value); }

bool IsNonEmpty(const std::string &value) { return !value.empty(); }

bool IsSha256(const std::string &value) {
  return value.size() == 64 &&
         std::all_of(value.begin(), value.end(), [](char character) {
           return (character >= '0' && character <= '9') ||
                  (character >= 'a' && character <= 'f');
         });
}

template <std::size_t N>
bool Contains(const std::array<const char *, N> &values,
              const std::string &value) {
  return std::any_of(values.begin(), values.end(),
                     [&](const char *candidate) { return value == candidate; });
}

unsigned PhaseOrder(const std::string &phase) {
  const auto found =
      std::find_if(kPhases.begin(), kPhases.end(),
                   [&](const char *candidate) { return phase == candidate; });
  if (found == kPhases.end()) {
    throw std::invalid_argument(
        "event phase must be work, xfer, commit, or async");
  }
  return static_cast<unsigned>(std::distance(kPhases.begin(), found));
}

bool Less(const OrderKey &left, const OrderKey &right) {
  if (left.cycle != right.cycle) {
    return left.cycle < right.cycle;
  }
  if (left.phase != right.phase) {
    return left.phase < right.phase;
  }
  return left.sequence < right.sequence;
}

std::string NumberedPath(const char *directory, std::uint64_t number,
                         const char *suffix) {
  std::ostringstream path;
  path << directory << '/' << std::setw(6) << std::setfill('0') << number
       << suffix;
  return path.str();
}

std::string NumberedId(const char *prefix, std::uint64_t number) {
  std::ostringstream id;
  id << prefix << '-' << std::setw(6) << std::setfill('0') << number;
  return id.str();
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
    const auto count = static_cast<unsigned>(std::min<std::size_t>(
        content.size() - offset, std::numeric_limits<unsigned>::max()));
    if (gzwrite(output, content.data() + offset, count) !=
        static_cast<int>(count)) {
      gzclose(output);
      throw std::runtime_error("cannot write gzip output: " + path.string());
    }
    offset += count;
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

rapidjson::Document ParseObject(const std::string &json,
                                const char *description) {
  rapidjson::Document document;
  document.Parse(json.data(), json.size());
  if (document.HasParseError() || !document.IsObject()) {
    throw std::invalid_argument(std::string(description) +
                                " must contain one JSON object");
  }
  return document;
}

void ValidateCheckpointState(const rapidjson::Value &state) {
  constexpr std::array<const char *, 5> members = {
      "queueTokens", "queueOccupancy", "tileResidencies", "associations",
      "computations"};
  if (!state.IsObject() || state.MemberCount() != members.size()) {
    throw std::invalid_argument(
        "checkpoint state must contain exactly the five reducer fields");
  }
  for (const char *member : members) {
    if (!state.HasMember(member)) {
      throw std::invalid_argument(std::string("checkpoint state is missing ") +
                                  member);
    }
  }
  if (!state["queueTokens"].IsArray() || !state["queueOccupancy"].IsArray() ||
      !state["tileResidencies"].IsArray() || !state["associations"].IsArray() ||
      !state["computations"].IsArray()) {
    throw std::invalid_argument("checkpoint reducer state has invalid shapes");
  }
}

std::string EmptyCheckpointState() {
  return R"({"queueTokens":[],"queueOccupancy":[],"tileResidencies":[],"associations":[],"computations":[]})";
}

std::string SerializeEvent(const StoredEvent &stored) {
  auto payload = ParseObject(stored.event.payloadJson, "event payloadJson");
  rapidjson::StringBuffer buffer;
  rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
  writer.StartObject();
  writer.Key("timeDomain");
  writer.String(stored.event.timeDomain.c_str());
  writer.Key("cycle");
  writer.String(Decimal(stored.event.cycle).c_str());
  writer.Key("phase");
  writer.String(stored.event.phase.c_str());
  writer.Key("sequence");
  writer.Uint64(stored.sequence);
  writer.Key("type");
  writer.String(stored.event.type.c_str());
  writer.Key("entityId");
  writer.String(stored.event.entityId.c_str());
  writer.Key("payload");
  payload.Accept(writer);
  writer.EndObject();
  return {buffer.GetString(), buffer.GetSize()};
}

std::string SerializeCheckpoint(const WriterOptions &options,
                                const CheckpointMeta &meta,
                                const std::string &stateJson) {
  auto state = ParseObject(stateJson, "checkpoint stateJson");
  ValidateCheckpointState(state);
  rapidjson::StringBuffer buffer;
  rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
  writer.StartObject();
  writer.Key("schema");
  writer.String("linxsimcity.trace-checkpoint");
  writer.Key("schemaVersion");
  writer.String("1");
  writer.Key("runId");
  writer.String(options.runId.c_str());
  writer.Key("topologyFingerprint");
  writer.String(options.topologyFingerprint.c_str());
  writer.Key("timeDomain");
  writer.String(meta.timeDomain.c_str());
  writer.Key("cycle");
  writer.String(Decimal(meta.cycle).c_str());
  writer.Key("eventOrdinal");
  writer.String(Decimal(meta.eventOrdinal).c_str());
  writer.Key("state");
  state.Accept(writer);
  writer.EndObject();
  return {buffer.GetString(), buffer.GetSize()};
}

} // namespace

class BundleWriter::Impl {
public:
  explicit Impl(WriterOptions writerOptions)
      : options(std::move(writerOptions)) {
    ValidateOptions();
    const auto topology = ParseObject(options.topologyJson, "topologyJson");
    if (topology.HasMember("nodes") && topology["nodes"].IsArray()) {
      for (const auto &node : topology["nodes"].GetArray()) {
        if (node.IsObject() && node.HasMember("id") && node["id"].IsString()) {
          entityIds.emplace(node["id"].GetString());
        }
      }
    }
  }

  void ValidateOptions() {
    if (options.outputDirectory.empty() || !IsNonEmpty(options.runId) ||
        !IsNonEmpty(options.topologyFingerprint) ||
        !IsNonEmpty(options.simulator.name) ||
        !IsNonEmpty(options.simulator.revision) ||
        !IsNonEmpty(options.workload.name) || options.topologyJson.empty()) {
      throw std::invalid_argument("writer requires output, run, simulator, "
                                  "workload, and topology bindings");
    }
    if (!IsSha256(options.simulator.configSha256) ||
        !IsSha256(options.workload.sha256)) {
      throw std::invalid_argument(
          "config and workload SHA-256 must be 64 lowercase hex characters");
    }
    if (options.timeDomains.empty()) {
      throw std::invalid_argument("writer requires at least one time domain");
    }
    std::unordered_set<std::string> domainIds;
    for (const auto &domain : options.timeDomains) {
      if (domain.id.empty() || domain.tickNumerator == 0 ||
          domain.tickDenominator == 0 ||
          domain.tickNumerator > kMaxSafeInteger ||
          domain.tickDenominator > kMaxSafeInteger ||
          !domainIds.emplace(domain.id).second) {
        throw std::invalid_argument(
            "time domains require unique IDs and positive safe tick ratios");
      }
    }
    if (options.window.lastCycle < options.window.firstCycle ||
        options.chunkCycleSpan == 0 || options.checkpointCycleSpan == 0) {
      throw std::invalid_argument("window and cycle spans are invalid");
    }
    std::unordered_set<std::string> capabilities;
    for (const auto &capability : options.capabilities) {
      if (!Contains(kCapabilities, capability) ||
          !capabilities.emplace(capability).second) {
        throw std::invalid_argument(
            "capabilities must be unique current trace capabilities");
      }
    }
    if ((options.loss.truncated || options.loss.droppedEvents != 0) &&
        options.loss.reason.empty()) {
      throw std::invalid_argument("trace loss or truncation requires a reason");
    }
    if (options.window.complete &&
        (options.loss.truncated || options.loss.droppedEvents != 0)) {
      throw std::invalid_argument("a complete window cannot report trace loss");
    }
  }

  WriterOptions options;
  bool closed{false};
  std::unordered_set<std::string> entityIds;
  std::unordered_map<std::string, OrderKey> lastOrder;
  std::unordered_map<std::string, std::uint64_t> domainEventCounts;
  std::vector<StoredEvent> events;
  std::map<std::pair<std::string, std::uint64_t>, std::string> checkpointStates;
  std::vector<ChunkMeta> chunks;
  std::vector<CheckpointMeta> checkpoints;
};

BundleWriter::BundleWriter(WriterOptions options)
    : impl_(std::make_unique<Impl>(std::move(options))) {}

BundleWriter::~BundleWriter() = default;
BundleWriter::BundleWriter(BundleWriter &&) noexcept = default;

void BundleWriter::Emit(Event event) {
  if (!impl_ || impl_->closed) {
    throw std::logic_error("cannot emit after Close");
  }
  const auto domain = std::find_if(impl_->options.timeDomains.begin(),
                                   impl_->options.timeDomains.end(),
                                   [&](const TimeDomain &candidate) {
                                     return candidate.id == event.timeDomain;
                                   });
  if (domain == impl_->options.timeDomains.end()) {
    throw std::invalid_argument("event references an undeclared time domain");
  }
  if (event.cycle < impl_->options.window.firstCycle ||
      event.cycle > impl_->options.window.lastCycle) {
    throw std::invalid_argument("event cycle is outside the trace window");
  }
  const auto phase = PhaseOrder(event.phase);
  if (!Contains(kEventTypes, event.type) || event.entityId.empty()) {
    throw std::invalid_argument(
        "event type and entityId must use the current trace contract");
  }
  if (!impl_->entityIds.empty() && !impl_->entityIds.count(event.entityId)) {
    throw std::invalid_argument("event entityId is absent from topology");
  }
  ParseObject(event.payloadJson, "event payloadJson");

  const auto previous = impl_->lastOrder.find(event.timeDomain);
  std::uint64_t expectedSequence = 0;
  if (previous != impl_->lastOrder.end() &&
      previous->second.cycle == event.cycle &&
      previous->second.phase == phase) {
    if (previous->second.sequence ==
        std::numeric_limits<std::uint64_t>::max()) {
      throw TraceOrderError("event sequence overflow");
    }
    expectedSequence = previous->second.sequence + 1;
  }
  const auto sequence = event.sequence.value_or(expectedSequence);
  if (sequence > kMaxSafeInteger) {
    throw std::invalid_argument(
        "event sequence must be a non-negative safe integer");
  }
  if (event.sequence && sequence != expectedSequence) {
    throw TraceOrderError(
        "explicit event sequence does not match the next order key");
  }
  const OrderKey current{event.cycle, phase, sequence};
  if (previous != impl_->lastOrder.end() && !Less(previous->second, current)) {
    throw TraceOrderError(
        "events must increase by cycle, phase, sequence per time domain");
  }

  const auto ordinal = impl_->domainEventCounts[event.timeDomain]++;
  impl_->lastOrder[event.timeDomain] = current;
  impl_->events.push_back({std::move(event), sequence, ordinal});
}

void BundleWriter::SetCheckpointStateJson(std::string timeDomain,
                                          std::uint64_t cycle,
                                          std::string stateJson) {
  if (!impl_ || impl_->closed) {
    throw std::logic_error("cannot set checkpoint state after Close");
  }
  const auto known = std::any_of(
      impl_->options.timeDomains.begin(), impl_->options.timeDomains.end(),
      [&](const TimeDomain &domain) { return domain.id == timeDomain; });
  if (!known || cycle % impl_->options.checkpointCycleSpan != 0) {
    throw std::invalid_argument(
        "checkpoint state requires a declared domain and exact boundary cycle");
  }
  if (cycle < impl_->options.window.firstCycle ||
      cycle > impl_->options.window.lastCycle) {
    throw std::invalid_argument("checkpoint state is outside the trace window");
  }
  auto state = ParseObject(stateJson, "checkpoint stateJson");
  ValidateCheckpointState(state);
  const auto inserted = impl_->checkpointStates.emplace(
      std::make_pair(std::move(timeDomain), cycle), std::move(stateJson));
  if (!inserted.second) {
    throw std::invalid_argument(
        "checkpoint state already exists for domain and cycle");
  }
}

void BundleWriter::Close() {
  if (!impl_ || impl_->closed) {
    return;
  }
  auto &state = *impl_;
  std::filesystem::create_directories(state.options.outputDirectory / "chunks");
  std::filesystem::create_directories(state.options.outputDirectory /
                                      "checkpoints");
  WriteFile(state.options.outputDirectory / "topology.json",
            state.options.topologyJson);

  std::map<std::pair<std::string, std::uint64_t>,
           std::vector<const StoredEvent *>>
      groups;
  for (const auto &event : state.events) {
    groups[{event.event.timeDomain,
            event.event.cycle / state.options.chunkCycleSpan}]
        .push_back(&event);
  }

  std::map<std::pair<std::string, std::uint64_t>, std::string> checkpointIds;
  std::uint64_t checkpointNumber = 0;
  for (const auto &domain : state.options.timeDomains) {
    std::vector<const StoredEvent *> domainEvents;
    for (const auto &event : state.events) {
      if (event.event.timeDomain == domain.id)
        domainEvents.push_back(&event);
    }
    if (domainEvents.empty())
      continue;
    auto boundary = (domainEvents.front()->event.cycle /
                     state.options.checkpointCycleSpan) *
                    state.options.checkpointCycleSpan;
    const auto lastBoundary =
        (domainEvents.back()->event.cycle / state.options.checkpointCycleSpan) *
        state.options.checkpointCycleSpan;
    for (;;) {
      const auto checkpointId = NumberedId("checkpoint", checkpointNumber);
      checkpointIds[{domain.id, boundary}] = checkpointId;
      const auto checkpointPath =
          NumberedPath("checkpoints", checkpointNumber, ".json.gz");
      const auto ordinal = static_cast<std::uint64_t>(
          std::count_if(domainEvents.begin(), domainEvents.end(),
                        [&](const StoredEvent *event) {
                          return event->event.cycle < boundary;
                        }));
      CheckpointMeta checkpoint{
          checkpointId, checkpointPath, domain.id, boundary, ordinal, {}, 0};
      const auto supplied = state.checkpointStates.find({domain.id, boundary});
      const auto &stateJson = supplied == state.checkpointStates.end()
                                  ? EmptyCheckpointState()
                                  : supplied->second;
      WriteGzip(state.options.outputDirectory / checkpointPath,
                SerializeCheckpoint(state.options, checkpoint, stateJson));
      const auto checkpointCompressed =
          ReadFile(state.options.outputDirectory / checkpointPath);
      checkpoint.compressedBytes = checkpointCompressed.size();
      checkpoint.sha256 = internal::Sha256(checkpointCompressed);
      state.checkpoints.push_back(std::move(checkpoint));
      ++checkpointNumber;
      if (boundary == lastBoundary)
        break;
      if (boundary > std::numeric_limits<std::uint64_t>::max() -
                         state.options.checkpointCycleSpan) {
        throw std::overflow_error("checkpoint boundary overflow");
      }
      boundary += state.options.checkpointCycleSpan;
    }
  }

  std::uint64_t chunkNumber = 0;
  for (const auto &[key, events] : groups) {
    const auto checkpointCycle =
        (events.front()->event.cycle / state.options.checkpointCycleSpan) *
        state.options.checkpointCycleSpan;
    const auto checkpointId = checkpointIds.at({key.first, checkpointCycle});

    const auto chunkId = NumberedId("chunk", chunkNumber);
    const auto chunkPath = NumberedPath("chunks", chunkNumber, ".jsonl.gz");
    std::string content;
    for (const auto *event : events) {
      content += SerializeEvent(*event);
      content.push_back('\n');
    }
    WriteGzip(state.options.outputDirectory / chunkPath, content);
    const auto compressed = ReadFile(state.options.outputDirectory / chunkPath);
    state.chunks.push_back(
        {chunkId, chunkPath, key.first, events.front()->event.cycle,
         events.back()->event.cycle, static_cast<std::uint64_t>(events.size()),
         internal::Sha256(compressed),
         static_cast<std::uint64_t>(compressed.size()), checkpointId});
    ++chunkNumber;
  }

  rapidjson::StringBuffer manifestBuffer;
  rapidjson::Writer<rapidjson::StringBuffer> manifest(manifestBuffer);
  manifest.StartObject();
  manifest.Key("schema");
  manifest.String("linxsimcity.trace");
  manifest.Key("schemaVersion");
  manifest.String("1");
  manifest.Key("runId");
  manifest.String(state.options.runId.c_str());
  manifest.Key("topologyFingerprint");
  manifest.String(state.options.topologyFingerprint.c_str());
  manifest.Key("simulator");
  manifest.StartObject();
  manifest.Key("name");
  manifest.String(state.options.simulator.name.c_str());
  manifest.Key("revision");
  manifest.String(state.options.simulator.revision.c_str());
  manifest.Key("configSha256");
  manifest.String(state.options.simulator.configSha256.c_str());
  manifest.EndObject();
  manifest.Key("workload");
  manifest.StartObject();
  manifest.Key("name");
  manifest.String(state.options.workload.name.c_str());
  manifest.Key("sha256");
  manifest.String(state.options.workload.sha256.c_str());
  manifest.EndObject();
  manifest.Key("timeDomains");
  manifest.StartArray();
  for (const auto &domain : state.options.timeDomains) {
    manifest.StartObject();
    manifest.Key("id");
    manifest.String(domain.id.c_str());
    manifest.Key("unit");
    manifest.String("cycle");
    manifest.Key("tickRatio");
    manifest.StartObject();
    manifest.Key("numerator");
    manifest.Uint64(domain.tickNumerator);
    manifest.Key("denominator");
    manifest.Uint64(domain.tickDenominator);
    manifest.EndObject();
    manifest.EndObject();
  }
  manifest.EndArray();
  manifest.Key("window");
  manifest.StartObject();
  manifest.Key("firstCycle");
  manifest.String(Decimal(state.options.window.firstCycle).c_str());
  manifest.Key("lastCycle");
  manifest.String(Decimal(state.options.window.lastCycle).c_str());
  manifest.Key("startsFromReset");
  manifest.Bool(state.options.window.startsFromReset);
  manifest.Key("complete");
  manifest.Bool(state.options.window.complete);
  manifest.EndObject();
  manifest.Key("eventCount");
  manifest.String(Decimal(state.events.size()).c_str());
  manifest.Key("capabilities");
  manifest.StartArray();
  for (const auto &capability : state.options.capabilities)
    manifest.String(capability.c_str());
  manifest.EndArray();
  manifest.Key("loss");
  manifest.StartObject();
  manifest.Key("droppedEvents");
  manifest.String(Decimal(state.options.loss.droppedEvents).c_str());
  manifest.Key("truncated");
  manifest.Bool(state.options.loss.truncated);
  if (!state.options.loss.reason.empty()) {
    manifest.Key("reason");
    manifest.String(state.options.loss.reason.c_str());
  }
  manifest.EndObject();
  manifest.EndObject();
  WriteFile(state.options.outputDirectory / "manifest.json",
            {manifestBuffer.GetString(), manifestBuffer.GetSize()});

  rapidjson::StringBuffer indexBuffer;
  rapidjson::Writer<rapidjson::StringBuffer> index(indexBuffer);
  index.StartObject();
  index.Key("schema");
  index.String("linxsimcity.trace-index");
  index.Key("schemaVersion");
  index.String("1");
  index.Key("runId");
  index.String(state.options.runId.c_str());
  index.Key("topologyFingerprint");
  index.String(state.options.topologyFingerprint.c_str());
  index.Key("chunks");
  index.StartArray();
  for (const auto &chunk : state.chunks) {
    index.StartObject();
    index.Key("id");
    index.String(chunk.id.c_str());
    index.Key("path");
    index.String(chunk.path.c_str());
    index.Key("timeDomain");
    index.String(chunk.timeDomain.c_str());
    index.Key("firstCycle");
    index.String(Decimal(chunk.firstCycle).c_str());
    index.Key("lastCycle");
    index.String(Decimal(chunk.lastCycle).c_str());
    index.Key("eventCount");
    index.String(Decimal(chunk.eventCount).c_str());
    index.Key("sha256");
    index.String(chunk.sha256.c_str());
    index.Key("compressedBytes");
    index.Uint64(chunk.compressedBytes);
    index.Key("checkpointId");
    index.String(chunk.checkpointId.c_str());
    index.EndObject();
  }
  index.EndArray();
  index.Key("checkpoints");
  index.StartArray();
  for (const auto &checkpoint : state.checkpoints) {
    index.StartObject();
    index.Key("id");
    index.String(checkpoint.id.c_str());
    index.Key("path");
    index.String(checkpoint.path.c_str());
    index.Key("timeDomain");
    index.String(checkpoint.timeDomain.c_str());
    index.Key("cycle");
    index.String(Decimal(checkpoint.cycle).c_str());
    index.Key("eventOrdinal");
    index.String(Decimal(checkpoint.eventOrdinal).c_str());
    index.Key("sha256");
    index.String(checkpoint.sha256.c_str());
    index.Key("compressedBytes");
    index.Uint64(checkpoint.compressedBytes);
    index.EndObject();
  }
  index.EndArray();
  index.EndObject();
  WriteFile(state.options.outputDirectory / "index.json",
            {indexBuffer.GetString(), indexBuffer.GetSize()});
  state.closed = true;
}

} // namespace linxsimcity::trace
