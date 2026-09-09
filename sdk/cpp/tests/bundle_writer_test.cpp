#include "linxsimcity/trace/bundle_writer.h"

#include "sha256.h"

#include <rapidjson/document.h>
#include <zlib.h>

#include <atomic>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>

namespace fs = std::filesystem;
using namespace linxsimcity::trace;

namespace {

void Require(bool condition, const char *message) {
  if (!condition)
    throw std::runtime_error(message);
}

std::string ReadFile(const fs::path &path) {
  std::ifstream input(path, std::ios::binary);
  return {std::istreambuf_iterator<char>(input),
          std::istreambuf_iterator<char>()};
}

std::string ReadGzip(const fs::path &path) {
  gzFile input = gzopen(path.string().c_str(), "rb");
  if (!input)
    throw std::runtime_error("cannot open gzip");
  std::string result;
  char buffer[4096];
  for (;;) {
    const int count = gzread(input, buffer, sizeof(buffer));
    if (count < 0) {
      gzclose(input);
      throw std::runtime_error("cannot read gzip");
    }
    if (count == 0)
      break;
    result.append(buffer, static_cast<std::size_t>(count));
  }
  gzclose(input);
  return result;
}

rapidjson::Document Parse(const std::string &json) {
  rapidjson::Document document;
  document.Parse(json.data(), json.size());
  Require(!document.HasParseError(), "generated JSON does not parse");
  return document;
}

fs::path TempDirectory(const char *name) {
  static std::atomic<unsigned> nonce{0};
  const auto path =
      fs::temp_directory_path() /
      (std::string("linxsimcity-cpp-") + name + "-" + std::to_string(nonce++));
  fs::remove_all(path);
  return path;
}

std::string Sha(char digit) { return std::string(64, digit); }

std::string Topology() {
  return R"({"schema":"linxsimcity.topology","schemaVersion":"1","id":"test","name":"test","revision":"test","nodes":[{"id":"queue.q","definitionId":"core.queue","label":"Q","parameters":{},"area":{"value":null,"unit":"um2","status":"unknown","source":"test"}}],"edges":[]})";
}

WriterOptions Options(const fs::path &output) {
  WriterOptions options;
  options.outputDirectory = output;
  options.runId = "run.test";
  options.topologyFingerprint = "fnv1a64:0123456789abcdef";
  options.simulator = {"test-sim", "revision-1", Sha('a')};
  options.workload = {"test-workload", Sha('b')};
  options.topologyJson = Topology();
  options.timeDomains = {{"core", 1, 1}};
  options.window = {0, 8192, true, true};
  options.capabilities = {"queue-lifecycle"};
  return options;
}

Event QueueEvent(std::uint64_t cycle, std::string phase = "work") {
  return Event{"core",
               cycle,
               std::move(phase),
               std::nullopt,
               "queue.write-attempt",
               "queue.q",
               R"({"tokenId":"token.0","producerNodeId":"queue.q"})"};
}

template <typename Function>
void RequireThrows(Function function, const char *message) {
  bool threw = false;
  try {
    function();
  } catch (const std::exception &) {
    threw = true;
  }
  Require(threw, message);
}

void TestCurrentBundleContractAndHashes() {
  const auto output = TempDirectory("contract");
  BundleWriter writer(Options(output));
  writer.Emit(QueueEvent(0));
  writer.Emit(QueueEvent(0));
  writer.Emit(QueueEvent(4096, "xfer"));
  writer.SetCheckpointStateJson(
      "core", 4096,
      R"({"queueTokens":[],"queueOccupancy":[{"queueId":"queue.q","occupancy":0,"capacity":4}],"tileResidencies":[],"associations":[],"computations":[]})");
  writer.Close();

  Require(ReadFile(output / "topology.json") == Topology(),
          "caller topology JSON was not preserved");
  const auto manifestText = ReadFile(output / "manifest.json");
  const auto manifest = Parse(manifestText);
  Require(manifest["schema"] == "linxsimcity.trace", "wrong manifest schema");
  Require(manifest["schemaVersion"] == "1", "wrong manifest version");
  Require(manifest["runId"] == "run.test", "run binding missing");
  Require(manifest["topologyFingerprint"] == "fnv1a64:0123456789abcdef",
          "topology binding missing");
  Require(std::string(manifest["simulator"]["configSha256"].GetString()) ==
              Sha('a'),
          "simulator binding missing");
  Require(std::string(manifest["workload"]["sha256"].GetString()) == Sha('b'),
          "workload binding missing");
  Require(manifest["eventCount"].IsString() && manifest["eventCount"] == "3",
          "eventCount must be a decimal string");
  Require(manifest["window"]["firstCycle"].IsString() &&
              manifest["window"]["lastCycle"].IsString(),
          "manifest cycles must be decimal strings");

  const auto index = Parse(ReadFile(output / "index.json"));
  Require(index["schema"] == "linxsimcity.trace-index", "wrong index schema");
  Require(index["chunks"].Size() == 2 && index["checkpoints"].Size() == 2,
          "chunk/checkpoint metadata missing");
  for (const auto &chunk : index["chunks"].GetArray()) {
    Require(chunk["firstCycle"].IsString() && chunk["lastCycle"].IsString() &&
                chunk["eventCount"].IsString(),
            "index u64 fields must be decimal strings");
    const auto path = output / chunk["path"].GetString();
    const auto compressed = ReadFile(path);
    Require(chunk["compressedBytes"].GetUint64() == fs::file_size(path),
            "chunk compressedBytes is inaccurate");
    Require(std::string(chunk["sha256"].GetString()) ==
                internal::Sha256(compressed),
            "chunk hash is inaccurate");
  }
  const auto chunk = ReadGzip(output / index["chunks"][0]["path"].GetString());
  const auto newline = chunk.find('\n');
  const auto event = Parse(chunk.substr(0, newline));
  Require(event["cycle"].IsString() && event["cycle"] == "0",
          "event cycle must be a decimal string");
  Require(event["sequence"].GetUint64() == 0,
          "writer did not assign first sequence");
  const auto second = Parse(
      chunk.substr(newline + 1, chunk.find('\n', newline + 1) - newline - 1));
  Require(second["sequence"].GetUint64() == 1,
          "writer did not increment sequence");

  for (const auto &checkpoint : index["checkpoints"].GetArray()) {
    Require(checkpoint["cycle"].IsString() &&
                checkpoint["eventOrdinal"].IsString(),
            "checkpoint u64 metadata must be strings");
    const auto path = output / checkpoint["path"].GetString();
    const auto compressed = ReadFile(path);
    Require(std::string(checkpoint["sha256"].GetString()) ==
                internal::Sha256(compressed),
            "checkpoint hash is inaccurate");
    const auto document = Parse(ReadGzip(path));
    Require(document["schema"] == "linxsimcity.trace-checkpoint",
            "wrong checkpoint schema");
    Require(document["cycle"].IsString() && document["eventOrdinal"].IsString(),
            "checkpoint binding u64 fields must be strings");
    Require(document["state"].MemberCount() == 5,
            "checkpoint reducer state is not strict");
  }
  const auto secondCheckpoint =
      Parse(ReadGzip(output / index["checkpoints"][1]["path"].GetString()));
  Require(secondCheckpoint["state"]["queueOccupancy"][0]["queueId"] ==
              "queue.q",
          "caller checkpoint state was not used");
  fs::remove_all(output);
}

void TestValidationDoesNotMutateOrder() {
  const auto output = TempDirectory("validation");
  BundleWriter writer(Options(output));
  auto invalidPhase = QueueEvent(1, "transfer");
  RequireThrows([&] { writer.Emit(invalidPhase); },
                "invalid phase was accepted");
  auto unknownEntity = QueueEvent(1);
  unknownEntity.entityId = "missing";
  RequireThrows([&] { writer.Emit(unknownEntity); },
                "unknown entity was accepted");
  writer.Emit(QueueEvent(1));
  auto skippedSequence = QueueEvent(1);
  skippedSequence.sequence = 2;
  RequireThrows([&] { writer.Emit(skippedSequence); },
                "invalid explicit sequence was accepted");
  auto backwards = QueueEvent(0);
  RequireThrows([&] { writer.Emit(backwards); },
                "backwards event was accepted");
  writer.Emit(QueueEvent(1));
  writer.Close();
  const auto manifest = Parse(ReadFile(output / "manifest.json"));
  Require(manifest["eventCount"] == "2",
          "rejected events changed manifest event count");
  fs::remove_all(output);
}

void TestRequiredMetadataAndCheckpointShape() {
  auto missing = Options(TempDirectory("missing"));
  missing.runId.clear();
  RequireThrows([&] { BundleWriter writer(missing); },
                "missing run metadata was accepted");
  auto badSha = Options(TempDirectory("sha"));
  badSha.workload.sha256 = Sha('A');
  RequireThrows([&] { BundleWriter writer(badSha); },
                "uppercase SHA-256 was accepted");
  auto noDomain = Options(TempDirectory("domain"));
  noDomain.timeDomains.clear();
  RequireThrows([&] { BundleWriter writer(noDomain); },
                "missing time domains were accepted");

  const auto output = TempDirectory("checkpoint-shape");
  BundleWriter writer(Options(output));
  RequireThrows(
      [&] {
        writer.SetCheckpointStateJson("core", 0, R"({"queueTokens":[]})");
      },
      "incomplete checkpoint state was accepted");
  writer.Close();
  fs::remove_all(output);
}

void TestCheckpointScheduleIsIndependentFromChunks() {
  const auto output = TempDirectory("checkpoint-span");
  auto options = Options(output);
  options.checkpointCycleSpan = 2048;
  BundleWriter writer(std::move(options));
  writer.Emit(QueueEvent(0));
  writer.Emit(QueueEvent(4096));
  writer.Close();
  const auto index = Parse(ReadFile(output / "index.json"));
  Require(index["chunks"].Size() == 2, "expected two chunk buckets");
  Require(index["checkpoints"].Size() == 3,
          "checkpoint span was not scheduled independently");
  Require(index["checkpoints"][1]["cycle"] == "2048",
          "middle checkpoint boundary missing");
  Require(index["chunks"][1]["checkpointId"] == index["checkpoints"][2]["id"],
          "chunk does not reference its nearest checkpoint");
  fs::remove_all(output);
}

void TestWindowCanCloseAtTheObservedFinalCycle() {
  const auto output = TempDirectory("window-close");
  BundleWriter writer(Options(output));
  writer.Emit(QueueEvent(7));
  writer.SetWindowLastCycle(7);
  writer.Close();
  const auto manifest = Parse(ReadFile(output / "manifest.json"));
  Require(manifest["window"]["lastCycle"] == "7",
          "writer did not close the window at the observed final cycle");
  fs::remove_all(output);
}

} // namespace

int main() {
  try {
    TestCurrentBundleContractAndHashes();
    TestValidationDoesNotMutateOrder();
    TestRequiredMetadataAndCheckpointShape();
    TestCheckpointScheduleIsIndependentFromChunks();
    TestWindowCanCloseAtTheObservedFinalCycle();
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
  return 0;
}
