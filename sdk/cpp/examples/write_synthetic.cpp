#include "linxsimcity/trace/bundle_writer.h"

#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>

namespace fs = std::filesystem;
using namespace linxsimcity::trace;

namespace {

WriterOptions MakeOptions(const fs::path &output) {
  WriterOptions options;
  options.outputDirectory = output;
  options.runId = "synthetic.queue-flow";
  options.topologyFingerprint = "fnv1a64:adf7525e382f21f3";
  options.simulator = {
      "linxsimcity-cpp-example", "1",
      "0000000000000000000000000000000000000000000000000000000000000000"};
  options.workload = {
      "one-token",
      "1111111111111111111111111111111111111111111111111111111111111111"};
  options.topologyJson =
      R"({"schema":"linxsimcity.topology","schemaVersion":"1","id":"synthetic.queue-flow","name":"Synthetic queue flow","revision":"example","nodes":[{"id":"queue.issue","definitionId":"core.queue","label":"Issue Queue","parameters":{"capacity":4},"area":{"value":null,"unit":"um2","status":"unknown","source":"example"}}],"edges":[]})";
  options.timeDomains = {{"core", 1, 1}};
  options.window = {0, 2, true, true};
  options.capabilities = {"queue-lifecycle"};
  return options;
}

void Emit(BundleWriter &writer, std::uint64_t cycle, const char *phase,
          const char *type, const char *payload) {
  writer.Emit(
      Event{"core", cycle, phase, std::nullopt, type, "queue.issue", payload});
}

} // namespace

int main(int argc, char **argv) {
  try {
    if (argc != 2) {
      std::cerr << "usage: write_synthetic OUTPUT.trace-dir\n";
      return 2;
    }
    const fs::path output = argv[1];
    if (fs::exists(output)) {
      throw std::runtime_error("output path already exists: " +
                               output.string());
    }
    BundleWriter writer(MakeOptions(output));
    Emit(writer, 0, "work", "queue.write-attempt",
         R"({"tokenId":"token.0","producerNodeId":"queue.issue"})");
    Emit(writer, 0, "xfer", "queue.accept",
         R"({"tokenId":"token.0","occupancy":1,"capacity":4,"slot":0})");
    Emit(writer, 1, "work", "queue.visible",
         R"({"tokenId":"token.0","occupancy":1,"capacity":4,"slot":0})");
    Emit(
        writer, 2, "work", "queue.read",
        R"({"tokenId":"token.0","occupancy":0,"capacity":4,"slot":0,"consumerNodeId":"queue.issue"})");
    writer.Close();
    std::cout << output.string() << '\n';
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
