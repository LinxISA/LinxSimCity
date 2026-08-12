#include "linxsimcity/trace/bundle_writer.h"

#include <array>
#include <cstdint>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>

namespace fs = std::filesystem;
using linxsimcity::trace::BundleWriter;
using linxsimcity::trace::Event;
using linxsimcity::trace::TopologyBuilder;
using linxsimcity::trace::TopologyEntity;
using linxsimcity::trace::WriterOptions;

namespace {

constexpr std::array<std::string_view, 48> kEventTypes = {
    "instruction.fetch",  "instruction.decode",
    "instruction.rename", "instruction.dispatch",
    "instruction.issue",  "instruction.complete",
    "instruction.retire", "instruction.squash",
    "pipeline.enter",     "pipeline.leave",
    "pipeline.stall",     "queue.allocate",
    "queue.release",      "queue.occupancy",
    "queue.full",         "rob.allocate",
    "rob.head",           "rob.tail",
    "rob.retire",         "rob.flush",
    "register.read",      "register.write",
    "register.ready",     "cache.access",
    "cache.hit",          "cache.miss",
    "cache.fill",         "cache.writeback",
    "cell.read",          "cell.write",
    "cell.grant",         "cell.conflict",
    "crossbar.request",   "crossbar.grant",
    "cube.dispatch",      "cube.stage",
    "cube.complete",      "cube.writeback",
    "vector.dispatch",    "vector.stage",
    "vector.complete",    "vector.writeback",
    "memory.request",     "memory.response",
    "pipe.transfer",      "flush.begin",
    "flush.end",          "marker.user"};

void AddEntity(TopologyBuilder &builder, std::string id, std::string kind,
               std::string label, std::string parent = {},
               std::uint64_t capacity = 0, std::int64_t index = -1) {
  TopologyEntity entity;
  entity.id = std::move(id);
  entity.kind = std::move(kind);
  entity.label = std::move(label);
  if (!parent.empty()) {
    entity.parentId = std::move(parent);
  }
  if (capacity != 0) {
    entity.capacity = capacity;
  }
  if (index >= 0) {
    entity.instance.emplace("index", static_cast<std::uint64_t>(index));
  }
  builder.AddEntity(std::move(entity));
}

TopologyBuilder BuildTopology() {
  TopologyBuilder builder;
  AddEntity(builder, "core", "module", "Linx Core");
  AddEntity(builder, "core.scalar", "module", "Scalar CPU", "core");
  for (const auto *stage : {"fetch", "decode", "rename", "dispatch", "issue",
                            "execute", "retire"}) {
    AddEntity(builder, "core.scalar." + std::string(stage), "module", stage,
              "core.scalar");
  }
  AddEntity(builder, "core.scalar.rob", "module", "SPEROB", "core.scalar", 128);
  AddEntity(builder, "core.scalar.rob.slot0", "rob-slot", "ROB 0",
            "core.scalar.rob", 0, 0);
  AddEntity(builder, "core.scalar.rob.slot127", "rob-slot", "ROB 127",
            "core.scalar.rob", 0, 127);
  AddEntity(builder, "core.scalar.iq", "module", "Issue Queue", "core.scalar",
            32);
  AddEntity(builder, "core.scalar.iq.slot0", "queue-slot", "IQ 0",
            "core.scalar.iq", 0, 0);
  AddEntity(builder, "core.scalar.prf", "module", "Physical Register File",
            "core.scalar", 256);
  AddEntity(builder, "core.scalar.prf.r0", "register", "PRF 0",
            "core.scalar.prf", 0, 0);
  AddEntity(builder, "core.scalar.l1i", "module", "L1I", "core.scalar", 1024);
  AddEntity(builder, "core.scalar.l1i.line0", "cache-line", "L1I line 0",
            "core.scalar.l1i", 0, 0);
  AddEntity(builder, "core.scalar.l1d", "module", "L1D", "core.scalar", 1024);
  AddEntity(builder, "core.scalar.l1d.line0", "cache-line", "L1D line 0",
            "core.scalar.l1d", 0, 0);

  AddEntity(builder, "pe0", "module", "PE0", "core");
  AddEntity(builder, "pe0.vector", "module", "Vector", "pe0");
  AddEntity(builder, "pe0.bg", "module", "Bank Group", "pe0");
  for (std::uint64_t bank = 0; bank < 8; ++bank) {
    const auto bankId = "pe0.bg.bank" + std::to_string(bank);
    AddEntity(builder, bankId, "module", "BG bank " + std::to_string(bank),
              "pe0.bg", 256);
    AddEntity(builder, bankId + ".row0", "cell",
              "CELL B" + std::to_string(bank) + "[0]", bankId, 0, 0);
  }
  AddEntity(builder, "pe0.xbar", "module", "8 to 4 Crossbar", "pe0");
  for (std::uint64_t lane = 0; lane < 4; ++lane) {
    AddEntity(builder, "pe0.xbar.a" + std::to_string(lane), "xbar-lane",
              "A lane " + std::to_string(lane), "pe0.xbar", 0,
              static_cast<std::int64_t>(lane));
  }
  AddEntity(builder, "pe0.cube", "module", "CUBE PE0", "pe0");
  AddEntity(builder, "pe0.cube.mac.m0.n0", "cube-mac", "MAC M0 N0", "pe0.cube");
  AddEntity(builder, "stgbufb", "module", "StgBufB Shared Tile Register",
            "core", 64);
  AddEntity(builder, "stgbufb.ssb0", "stgbufb-subspace", "SsbID 0", "stgbufb",
            0, 0);
  AddEntity(builder, "tlsu", "module", "TLSU", "core");
  AddEntity(builder, "pipe.a0", "pipe", "A horizontal lane 0", "core");
  AddEntity(builder, "pipe.b-broadcast", "pipe", "B vertical broadcast",
            "core");
  return builder;
}

std::string EntityFor(std::string_view type) {
  if (type == "instruction.fetch")
    return "core.scalar.fetch";
  if (type == "instruction.decode")
    return "core.scalar.decode";
  if (type == "instruction.rename")
    return "core.scalar.rename";
  if (type == "instruction.dispatch")
    return "core.scalar.dispatch";
  if (type == "instruction.issue")
    return "core.scalar.issue";
  if (type == "instruction.complete")
    return "core.scalar.execute";
  if (type == "instruction.retire")
    return "core.scalar.retire";
  if (type == "instruction.squash" || type.rfind("flush.", 0) == 0)
    return "core.scalar.rob";
  if (type.rfind("pipeline.", 0) == 0)
    return "core.scalar.execute";
  if (type.rfind("queue.", 0) == 0)
    return "core.scalar.iq.slot0";
  if (type.rfind("rob.", 0) == 0)
    return "core.scalar.rob.slot0";
  if (type.rfind("register.", 0) == 0)
    return "core.scalar.prf.r0";
  if (type == "cache.access" || type == "cache.hit")
    return "core.scalar.l1i.line0";
  if (type.rfind("cache.", 0) == 0)
    return "core.scalar.l1d.line0";
  if (type.rfind("cell.", 0) == 0)
    return "pe0.bg.bank0.row0";
  if (type.rfind("crossbar.", 0) == 0)
    return "pe0.xbar.a0";
  if (type.rfind("cube.", 0) == 0)
    return "pe0.cube.mac.m0.n0";
  if (type.rfind("vector.", 0) == 0)
    return "pe0.vector";
  if (type.rfind("memory.", 0) == 0)
    return "tlsu";
  if (type == "pipe.transfer")
    return "pipe.a0";
  return "core";
}

std::string PayloadFor(std::string_view type, std::uint64_t cycle) {
  if (type == "cell.read") {
    return R"({"request_id":7,"source":"cube","bytes":128,"result":"grant"})";
  }
  if (type.rfind("cache.", 0) == 0) {
    return "{\"set\":0,\"way\":0,\"line\":0,\"token\":" +
           std::to_string(cycle) + "}";
  }
  return "{\"token\":" + std::to_string(cycle) + "}";
}

void Emit(BundleWriter &writer, std::uint64_t cycle, std::string type,
          std::string entity, std::string payload) {
  writer.Emit(Event{cycle, 0, std::move(type), "core0", std::move(entity),
                    std::move(payload)});
}

void EmitCycle(BundleWriter &writer, std::uint64_t cycle) {
  writer.BeginCycle(cycle);
  const auto type = kEventTypes[cycle % kEventTypes.size()];
  Emit(writer, cycle, std::string(type), EntityFor(type),
       PayloadFor(type, cycle));

  if (cycle == 120) {
    for (std::uint64_t bank = 0; bank < 4; ++bank) {
      Emit(writer, cycle, "cell.read",
           "pe0.bg.bank" + std::to_string(bank) + ".row0",
           "{\"request_id\":120,\"source\":\"cube\",\"bytes\":128,"
           "\"result\":\"grant\",\"a_lane\":" +
               std::to_string(bank) + "}");
    }
    Emit(
        writer, cycle, "cell.grant", "pe0.xbar.a0",
        R"({"banks":[0,1,2,3],"bytes_per_bank":128,"direction":"horizontal"})");
    Emit(writer, cycle, "pipe.transfer", "pipe.b-broadcast",
         R"({"operand":"B","direction":"vertical","gmma":true,"ssbid":0})");
  } else if (cycle == 121) {
    Emit(writer, cycle, "cell.conflict", "pe0.bg.bank4.row0",
         R"({"request_ids":[121,122],"winner":121,"bank":4})");
  } else if (cycle == 200) {
    Emit(writer, cycle, "rob.tail", "core.scalar.rob.slot127",
         R"({"slot":127,"wrap":false})");
  } else if (cycle == 201) {
    Emit(writer, cycle, "rob.tail", "core.scalar.rob.slot0",
         R"({"slot":0,"wrap":true})");
  } else if (cycle == 220) {
    Emit(writer, cycle, "flush.begin", "core.scalar.rob",
         R"({"reason":"branch_mispredict","from_slot":96})");
  } else if (cycle == 221) {
    Emit(writer, cycle, "flush.end", "core.scalar.rob",
         R"({"squashed":12,"restart_cycle":222})");
  }
  writer.EndCycle();
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
    BundleWriter writer(WriterOptions{output, "pipeline", 4096, 4096});
    writer.SetTopology(BuildTopology().Build());
    for (std::uint64_t cycle = 0; cycle < 256; ++cycle) {
      EmitCycle(writer, cycle);
    }
    writer.Close();
    std::cout << output.string() << '\n';
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
