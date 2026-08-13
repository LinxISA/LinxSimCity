#include "linxsimcity/trace/bundle_writer.h"
#include "sha256.h"

#include <rapidjson/document.h>
#include <zlib.h>

#include <array>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <type_traits>

namespace fs = std::filesystem;
using linxsimcity::trace::BundleWriter;
using linxsimcity::trace::Event;
using linxsimcity::trace::TopologyBuilder;
using linxsimcity::trace::TopologyDistrict;
using linxsimcity::trace::TopologyEntity;
using linxsimcity::trace::TopologyLayout;
using linxsimcity::trace::TopologyPlacement;
using linxsimcity::trace::TopologyPort;
using linxsimcity::trace::TopologyRoute;
using linxsimcity::trace::TraceOrderError;
using linxsimcity::trace::WriterOptions;

static_assert(std::is_move_constructible_v<BundleWriter>);
static_assert(!std::is_move_assignable_v<BundleWriter>);

namespace {

void Require(bool condition, const std::string &message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

std::string ReadFile(const fs::path &path) {
  std::ifstream input(path, std::ios::binary);
  Require(input.good(), "cannot read " + path.string());
  return {std::istreambuf_iterator<char>(input),
          std::istreambuf_iterator<char>()};
}

std::string ReadGzip(const fs::path &path) {
  gzFile input = gzopen(path.string().c_str(), "rb");
  Require(input != nullptr, "cannot open gzip " + path.string());
  std::string result;
  std::array<char, 1024> buffer{};
  int count = 0;
  while ((count = gzread(input, buffer.data(),
                         static_cast<unsigned>(buffer.size()))) > 0) {
    result.append(buffer.data(), static_cast<std::size_t>(count));
  }
  const int closeResult = gzclose(input);
  Require(count == 0 && closeResult == Z_OK,
          "cannot read gzip " + path.string());
  return result;
}

rapidjson::Document ParseJson(const std::string &json) {
  rapidjson::Document document;
  document.Parse(json.c_str(), json.size());
  Require(!document.HasParseError(), "invalid JSON");
  return document;
}

fs::path TempDirectory(const std::string &name) {
  const auto nonce =
      std::chrono::steady_clock::now().time_since_epoch().count();
  const auto path = fs::temp_directory_path() /
                    ("linxsimcity-" + name + "-" + std::to_string(nonce));
  fs::create_directories(path);
  return path;
}

TopologyBuilder OneEntityTopology() {
  TopologyBuilder builder;
  TopologyEntity entity;
  entity.id = "pe0.fetch";
  entity.kind = "module";
  entity.label = "Fetch";
  builder.AddEntity(std::move(entity));
  return builder;
}

Event MakeEvent(std::uint64_t cycle, std::string type = "pipeline.enter") {
  return Event{cycle, 0,           std::move(type),
               "pe0", "pe0.fetch", R"({"stage":"fetch"})"};
}

void TestContractAndStrictOrdering() {
  const auto output = TempDirectory("contract");
  BundleWriter writer(WriterOptions{output});
  writer.SetTopology(OneEntityTopology().Build());
  writer.BeginCycle(3);
  writer.Emit(MakeEvent(3));
  writer.Emit(MakeEvent(3, "pipeline.leave"));
  writer.EndCycle();

  writer.BeginCycle(3);
  bool threw = false;
  try {
    writer.Emit(MakeEvent(3));
  } catch (const TraceOrderError &) {
    threw = true;
  }
  Require(threw, "emitting (3,0) after (3,1) must throw TraceOrderError");
  writer.Close();

  Require(fs::is_regular_file(output / "manifest.json"),
          "manifest.json missing");
  Require(fs::is_regular_file(output / "topology.json"),
          "topology.json missing");
  Require(fs::is_regular_file(output / "strings.json"), "strings.json missing");
  Require(fs::is_regular_file(output / "index.json"), "index.json missing");
  Require(fs::is_regular_file(output / "chunks/000000.jsonl.gz"),
          "chunk missing");
  Require(fs::is_regular_file(output / "checkpoints/000000.json.gz"),
          "checkpoint missing");

  const auto lines = ReadGzip(output / "chunks/000000.jsonl.gz");
  Require(lines.find(R"("seq":0)") != std::string::npos,
          "first assigned seq missing");
  Require(lines.find(R"("seq":1)") != std::string::npos,
          "second assigned seq missing");
  ParseJson(ReadGzip(output / "checkpoints/000000.json.gz"));
  fs::remove_all(output);
}

void TestPhysicalTopologyAndCapabilitiesSerializeExactly() {
  const auto output = TempDirectory("physical-topology");
  WriterOptions options{output};
  options.capabilities = {"instruction-causality-v1", "physical-layout-v1"};
  BundleWriter writer(std::move(options));

  auto topology = OneEntityTopology().Build();
  topology.schemaVersion = "1.1.0";
  TopologyLayout layout;
  layout.districts.push_back(
      TopologyDistrict{"scalar", {0.0, 2.0, 0.0}, {20.0, 4.0, 12.0}});
  topology.layout = std::move(layout);

  auto &fetch = topology.entities.front();
  TopologyPlacement placement;
  placement.district = "scalar";
  placement.thread = 0;
  placement.position = {-5.0, 1.0, 0.0};
  placement.size = {4.0, 2.0, 3.0};
  placement.rotation = {0.0, 0.0, 0.0};
  placement.lodGroup = "scalar-pipeline";
  fetch.placement = std::move(placement);
  TopologyPort fetchPort;
  fetchPort.id = "pe0.fetch.out";
  fetchPort.direction = "out";
  fetchPort.widthBytes = 16;
  fetchPort.position = linxsimcity::trace::TopologyVector3{-3.0, 1.0, 0.0};
  fetch.ports.push_back(std::move(fetchPort));

  TopologyEntity pipe;
  pipe.id = "pipe.scalar.fetch";
  pipe.kind = "pipe";
  pipe.label = "Fetch route";
  pipe.route = TopologyRoute{"orthogonal",
                             "pe0.fetch.out",
                             "pe0.fetch.out",
                             {{-3.0, 1.0, 0.0}, {0.0, 1.0, 0.0}}};
  topology.entities.push_back(std::move(pipe));

  writer.SetTopology(std::move(topology));
  writer.Close();

  const auto topologyJson = ParseJson(ReadFile(output / "topology.json"));
  Require(topologyJson["layout"]["schema"] == "linx-city-v1",
          "layout schema missing");
  Require(topologyJson["layout"]["districts"][0]["size"][2].GetDouble() == 12.0,
          "district size missing");
  Require(topologyJson["entities"][0]["placement"]["thread"].GetUint64() == 0,
          "placement thread missing");
  Require(topologyJson["entities"][0]["placement"]["position"][0].GetDouble() ==
              -5.0,
          "placement position missing");
  Require(topologyJson["entities"][0]["ports"][0]["position"][0].GetDouble() ==
              -3.0,
          "port position missing");
  Require(topologyJson["entities"][1]["route"]["style"] == "orthogonal",
          "route style missing");
  Require(topologyJson["entities"][1]["route"]["points"].Size() == 2,
          "route points missing");

  const auto manifest = ParseJson(ReadFile(output / "manifest.json"));
  Require(manifest["schemaVersion"] == topologyJson["schemaVersion"],
          "manifest and physical topology schema versions differ");
  Require(manifest["capabilities"].Size() == 2,
          "manifest capabilities missing");
  Require(manifest["capabilities"][1] == "physical-layout-v1",
          "manifest capability order changed");
  fs::remove_all(output);
}

void TestChunkBoundaryAndIndexIntegrity() {
  const auto output = TempDirectory("boundary");
  BundleWriter writer(WriterOptions{output});
  writer.SetTopology(OneEntityTopology().Build());
  writer.BeginCycle(4095);
  writer.Emit(MakeEvent(4095));
  writer.EndCycle();
  writer.BeginCycle(4096);
  writer.Emit(MakeEvent(4096));
  writer.EndCycle();
  writer.Close();

  const auto firstChunk = output / "chunks/000000.jsonl.gz";
  const auto secondChunk = output / "chunks/000001.jsonl.gz";
  Require(fs::is_regular_file(firstChunk), "pre-boundary chunk missing");
  Require(fs::is_regular_file(secondChunk), "post-boundary chunk missing");
  Require(ReadGzip(firstChunk).find(R"("cycle":4095)") != std::string::npos,
          "pre-boundary event in wrong chunk");
  Require(ReadGzip(secondChunk).find(R"("cycle":4096)") != std::string::npos,
          "post-boundary event in wrong chunk");

  auto index = ParseJson(ReadFile(output / "index.json"));
  Require(index["chunks"].Size() == 2, "index chunk count must be two");
  for (rapidjson::SizeType i = 0; i < index["chunks"].Size(); ++i) {
    const auto &entry = index["chunks"][i];
    const auto chunkPath = output / entry["path"].GetString();
    const auto checkpointPath = output / entry["checkpointPath"].GetString();
    const auto compressed = ReadFile(chunkPath);
    Require(entry["eventCount"].GetUint64() == 1,
            "index event count is inaccurate");
    Require(entry["compressedBytes"].GetUint64() == fs::file_size(chunkPath),
            "index compressed size is inaccurate");
    Require(entry["sha256"].GetString() ==
                linxsimcity::trace::internal::Sha256(compressed),
            "index SHA-256 is inaccurate");
    Require(fs::is_regular_file(checkpointPath), "indexed checkpoint missing");
    const auto checkpoint = ParseJson(ReadGzip(checkpointPath));
    Require(checkpoint["cycle"].GetUint64() == i * 4096,
            "checkpoint cycle is inaccurate");
    Require(checkpoint["seq"].GetUint64() == 0, "checkpoint seq is inaccurate");
  }
  Require(
      linxsimcity::trace::internal::Sha256("abc") ==
          "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      "SHA-256 implementation fails known vector");
  fs::remove_all(output);
}

void TestCloseIsIdempotent() {
  const auto output = TempDirectory("close");
  BundleWriter writer(WriterOptions{output});
  writer.SetTopology(OneEntityTopology().Build());
  writer.BeginCycle(1);
  writer.Emit(MakeEvent(1));
  writer.EndCycle();
  writer.Close();
  const auto manifest = ReadFile(output / "manifest.json");
  const auto index = ReadFile(output / "index.json");
  writer.Close();
  Require(ReadFile(output / "manifest.json") == manifest,
          "second Close changed manifest");
  Require(ReadFile(output / "index.json") == index,
          "second Close changed index");
  fs::remove_all(output);
}

void TestMoveConstructionPreservesBufferedTrace() {
  const auto output = TempDirectory("move");
  BundleWriter source(WriterOptions{output});
  source.SetTopology(OneEntityTopology().Build());
  source.BeginCycle(7);
  source.Emit(MakeEvent(7));
  source.EndCycle();

  BundleWriter destination(std::move(source));
  destination.Close();

  const auto chunk = ReadGzip(output / "chunks/000000.jsonl.gz");
  Require(chunk.find(R"("cycle":7)") != std::string::npos,
          "move construction lost buffered trace data");
  fs::remove_all(output);
}

void TestCheckpointScheduleIsIndependentFromChunks() {
  const auto output = TempDirectory("checkpoint-span");
  BundleWriter writer(WriterOptions{output, "pipeline", 4096, 2048});
  writer.SetTopology(OneEntityTopology().Build());
  for (const std::uint64_t cycle : {0, 4096}) {
    writer.BeginCycle(cycle);
    writer.Emit(MakeEvent(cycle));
    writer.EndCycle();
  }
  writer.Close();

  const auto initialCheckpoint = output / "checkpoints/000000.json.gz";
  const auto middleCheckpoint = output / "checkpoints/000001.json.gz";
  const auto finalCheckpoint = output / "checkpoints/000002.json.gz";
  Require(fs::is_regular_file(initialCheckpoint),
          "initial checkpoint boundary missing");
  Require(fs::is_regular_file(middleCheckpoint),
          "2048-cycle checkpoint boundary missing");
  Require(fs::is_regular_file(finalCheckpoint),
          "4096-cycle checkpoint boundary missing");
  const auto middleMetadata = ParseJson(ReadGzip(middleCheckpoint));
  const auto finalMetadata = ParseJson(ReadGzip(finalCheckpoint));
  Require(middleMetadata["cycle"].GetUint64() == 2048,
          "middle checkpoint metadata is not on its cycle boundary");
  Require(finalMetadata["cycle"].GetUint64() == 4096,
          "final checkpoint metadata is not on its cycle boundary");

  const auto index = ParseJson(ReadFile(output / "index.json"));
  Require(std::string(index["chunks"][0]["checkpointPath"].GetString()) ==
              "checkpoints/000000.json.gz",
          "first chunk does not reference its nearest preceding checkpoint");
  Require(std::string(index["chunks"][1]["checkpointPath"].GetString()) ==
              "checkpoints/000002.json.gz",
          "second chunk does not reference its nearest preceding checkpoint");
  const auto manifest = ParseJson(ReadFile(output / "manifest.json"));
  Require(manifest["checkpointCycleSpan"].GetUint64() == 2048,
          "manifest checkpoint span does not match scheduling behavior");
  fs::remove_all(output);
}

void TestUnknownEntityDoesNotMutateWriterState() {
  const auto output = TempDirectory("entity-reference");
  BundleWriter writer(WriterOptions{output});
  writer.SetTopology(OneEntityTopology().Build());
  writer.BeginCycle(11);

  auto unknown = MakeEvent(11);
  unknown.entityId = "pe0.missing";
  bool threw = false;
  try {
    writer.Emit(std::move(unknown));
  } catch (const std::invalid_argument &) {
    threw = true;
  }
  Require(threw, "event with unknown entity ID must be rejected");

  writer.Emit(MakeEvent(11));
  writer.Emit(MakeEvent(11, "pipeline.leave"));
  writer.EndCycle();
  writer.Close();

  const auto chunk = ReadGzip(output / "chunks/000000.jsonl.gz");
  Require(chunk.find("pe0.missing") == std::string::npos,
          "rejected entity event was buffered");
  Require(chunk.find(R"("seq":0)") != std::string::npos,
          "rejection consumed the first sequence number");
  Require(chunk.find(R"("seq":1)") != std::string::npos,
          "writer was not usable after entity rejection");
  const auto manifest = ParseJson(ReadFile(output / "manifest.json"));
  Require(manifest["eventCount"].GetUint64() == 2,
          "rejected event mutated the event count");
  fs::remove_all(output);
}

} // namespace

int main() {
  try {
    TestContractAndStrictOrdering();
    TestPhysicalTopologyAndCapabilitiesSerializeExactly();
    TestChunkBoundaryAndIndexIntegrity();
    TestCloseIsIdempotent();
    TestMoveConstructionPreservesBufferedTrace();
    TestCheckpointScheduleIsIndependentFromChunks();
    TestUnknownEntityDoesNotMutateWriterState();
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
  return 0;
}
