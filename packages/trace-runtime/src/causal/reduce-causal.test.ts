import type { EventEnvelope } from "@linxsimcity/trace-schema";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { describe, expect, test } from "vitest";

import {
  restoreCheckpoint,
  snapshotToCheckpoint,
} from "../reducer/checkpoint.js";
import { reduceEvents } from "../reducer/reduce-event.js";
import { initialSnapshot, snapshotToObject } from "../reducer/state.js";

const topology: TopologyDescriptor = {
  schemaVersion: "1.1.0",
  entities: [
    "pe2.rename",
    "pe2.sperob.slot47",
    "pe2.prf.reg12",
    "pe2.prf.reg37",
    "core.shared.l1d.set3.way1",
    "pe2.tlsu",
    "pipe.pe2.tlsu.l1d",
    "pe2.execute.int0",
    "pe2.commit",
  ].map((id, index) => ({
    id,
    kind: id.includes("slot")
      ? "rob-slot"
      : id.includes("reg")
        ? "register"
        : id.includes("set")
          ? "cache-line"
          : id.startsWith("pipe.")
            ? "pipe"
            : "module",
    label: id,
    instance: { index },
  })),
};

function event(
  cycle: number,
  seq: number,
  type: EventEnvelope["type"],
  entity_id: string,
  payload: Record<string, unknown>,
): EventEnvelope {
  return { cycle, seq, type, scope: "pe2", entity_id, payload };
}

const instructionChain = (): EventEnvelope[] => [
  event(10, 0, "instruction.rename", "pe2.rename", {
    instruction_id: 9812,
    thread_id: 2,
    pc: 0x1000,
    disassembly_id: "inst.add.0",
    rob_slot: 47,
  }),
  event(10, 1, "rob.allocate", "pe2.sperob.slot47", {
    instruction_id: 9812,
    thread_id: 2,
    rob_slot: 47,
  }),
  event(11, 0, "register.read", "pe2.prf.reg12", {
    instruction_id: 9812,
    consumer_id: 9812,
    thread_id: 2,
    phys_reg: 12,
    port: 0,
    role: "source",
  }),
  event(12, 0, "cache.miss", "core.shared.l1d.set3.way1", {
    instruction_id: 9812,
    request_id: 7001,
    thread_id: 2,
    cache_id: "core.shared.l1d",
    level: "l1d",
    operation: "load",
    line_address: 0x4000,
    line_bytes: 64,
    set: 3,
    way: 1,
    tag: 4,
    state: "miss",
  }),
  event(12, 1, "pipe.transfer", "pipe.pe2.tlsu.l1d", {
    instruction_id: 9812,
    request_id: 7001,
    thread_id: 2,
    route_id: "pipe.pe2.tlsu.l1d",
    start_cycle: 12,
    end_cycle: 14,
  }),
  event(13, 0, "memory.request", "pe2.tlsu", {
    instruction_id: 9812,
    request_id: 7001,
    thread_id: 2,
    operation: "read",
    stage_id: "l1-miss",
    address: 0x4000,
    bytes: 8,
    source_entity_id: "pe2.tlsu",
    destination_entity_id: "core.shared.l1d.set3.way1",
  }),
  event(17, 0, "memory.response", "pe2.tlsu", {
    instruction_id: 9812,
    request_id: 7001,
    thread_id: 2,
    operation: "read",
    stage_id: "load-return",
    address: 0x4000,
    bytes: 8,
    source_entity_id: "core.shared.l1d.set3.way1",
    destination_entity_id: "pe2.tlsu",
  }),
  event(18, 0, "register.write", "pe2.prf.reg37", {
    instruction_id: 9812,
    producer_id: 9812,
    thread_id: 2,
    phys_reg: 37,
    port: 0,
    role: "destination",
  }),
  event(18, 1, "instruction.complete", "pe2.execute.int0", {
    instruction_id: 9812,
    thread_id: 2,
    pc: 0x1000,
    disassembly_id: "inst.add.0",
    rob_slot: 47,
  }),
  event(20, 0, "rob.retire", "pe2.sperob.slot47", {
    instruction_id: 9812,
    thread_id: 2,
    rob_slot: 47,
  }),
  event(20, 1, "instruction.retire", "pe2.commit", {
    instruction_id: 9812,
    thread_id: 2,
    pc: 0x1000,
    disassembly_id: "inst.add.0",
    rob_slot: 47,
  }),
];

describe("causal trace reduction", () => {
  test("connects one instruction to ROB, PRF, shared cache, route, and TLSU", () => {
    const snapshot = reduceEvents(
      initialSnapshot(topology),
      instructionChain(),
    );

    expect(snapshot.causal.instructions.get(9812)).toMatchObject({
      id: 9812,
      threadId: 2,
      robSlot: 47,
      stage: "retire",
      sourceRegisters: [12],
      destinationRegisters: [37],
      requestIds: [7001],
      routeIds: ["pipe.pe2.tlsu.l1d"],
      retired: true,
      squashed: false,
    });
    expect(snapshot.causal.requests.get(7001)).toMatchObject({
      id: 7001,
      instructionId: 9812,
      threadId: 2,
      stage: "memory.response",
      completed: true,
      cacheLineIds: ["core.shared.l1d.set3.way1"],
    });
    expect(snapshot.causal.robs.get("pe2.sperob.slot47")).toMatchObject({
      instructionId: 9812,
      slot: 47,
      status: "retired",
    });
    expect(snapshot.causal.prfs.get("pe2.prf.reg12")).toMatchObject({
      physReg: 12,
      lastReadInstructionIds: [9812],
    });
    expect(snapshot.causal.prfs.get("pe2.prf.reg37")).toMatchObject({
      physReg: 37,
      lastWriteInstructionId: 9812,
    });
    expect(snapshot.causal.instructions.get(9812)?.transitions).toEqual([
      {
        cycle: 10,
        seq: 0,
        type: "instruction.rename",
        entityId: "pe2.rename",
        routeId: undefined,
      },
      {
        cycle: 18,
        seq: 1,
        type: "instruction.complete",
        entityId: "pe2.execute.int0",
        routeId: undefined,
      },
      {
        cycle: 20,
        seq: 1,
        type: "instruction.retire",
        entityId: "pe2.commit",
        routeId: undefined,
      },
    ]);
  });

  test("bounds transition history while retaining the newest physical stages", () => {
    const transitions = Array.from({ length: 30 }, (_, index) =>
      event(index, 0, "pipeline.enter", "pe2.execute.int0", {
        instruction_id: 77,
        thread_id: 2,
        route_id: "pipe.pe2.tlsu.l1d",
        stage_id: `S${index}`,
      }),
    );

    const history = reduceEvents(
      initialSnapshot(topology),
      transitions,
    ).causal.instructions.get(77)?.transitions;

    expect(history).toHaveLength(24);
    expect(history?.[0]).toMatchObject({ cycle: 6, seq: 0 });
    expect(history?.at(-1)).toMatchObject({ cycle: 29, seq: 0 });
  });

  test("child cache traffic cannot evict the instruction's physical stage history", () => {
    const cacheTraffic = Array.from({ length: 30 }, (_, index) =>
      event(index + 2, 0, "cache.hit", "core.shared.l1d.set3.way1", {
        instruction_id: 88,
        request_id: 900 + index,
        thread_id: 2,
      }),
    );
    const history = reduceEvents(initialSnapshot(topology), [
      event(1, 0, "instruction.issue", "pe2.execute.int0", {
        instruction_id: 88,
        thread_id: 2,
      }),
      ...cacheTraffic,
    ]).causal.instructions.get(88)?.transitions;

    expect(history).toEqual([
      {
        cycle: 1,
        seq: 0,
        type: "instruction.issue",
        entityId: "pe2.execute.int0",
        routeId: undefined,
      },
    ]);
  });

  test("a squashed instruction can never become retired", () => {
    const events = [
      event(1, 0, "instruction.rename", "pe2.rename", {
        instruction_id: 55,
        thread_id: 2,
        pc: 0x2000,
        disassembly_id: "inst.squash",
        rob_slot: 47,
      }),
      event(2, 0, "rob.flush", "pe2.sperob.slot47", {
        instruction_id: 55,
        thread_id: 2,
        rob_slot: 47,
        reason: "branch-mispredict",
      }),
      event(3, 0, "instruction.retire", "pe2.commit", {
        instruction_id: 55,
        thread_id: 2,
        pc: 0x2000,
        disassembly_id: "inst.squash",
        rob_slot: 47,
      }),
    ];

    expect(
      reduceEvents(initialSnapshot(topology), events).causal.instructions.get(
        55,
      ),
    ).toMatchObject({ stage: "squash", squashed: true, retired: false });
  });

  test("retains concurrent thread accesses to one shared cache line", () => {
    const accesses = [0, 1, 2, 3].map((threadId, seq) =>
      event(30, seq, "cache.hit", "core.shared.l1d.set3.way1", {
        instruction_id: 100 + threadId,
        request_id: 200 + threadId,
        thread_id: threadId,
        cache_id: "core.shared.l1d",
        level: "l1d",
        operation: "load",
        line_address: 0x4000,
        line_bytes: 64,
        set: 3,
        way: 1,
        tag: 4,
        state: "hit",
      }),
    );

    expect(
      reduceEvents(initialSnapshot(topology), accesses).causal.caches.get(
        "core.shared.l1d.set3.way1",
      )?.activeAccesses,
    ).toMatchObject([
      { threadId: 0, requestId: 200 },
      { threadId: 1, requestId: 201 },
      { threadId: 2, requestId: 202 },
      { threadId: 3, requestId: 203 },
    ]);
  });

  test("checkpoint restore plus replay equals linear causal reduction", () => {
    const events = instructionChain();
    const first = reduceEvents(initialSnapshot(topology), events.slice(0, 6));
    const checkpoint = snapshotToCheckpoint(first);
    const restored = restoreCheckpoint(initialSnapshot(topology), checkpoint);
    const replayed = reduceEvents(restored, events.slice(6));
    const linear = reduceEvents(initialSnapshot(topology), events);

    expect(snapshotToObject(replayed)).toEqual(snapshotToObject(linear));
  });
});
