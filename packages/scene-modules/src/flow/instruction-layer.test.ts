import type {
  InstructionTraceState,
  InstructionTransition,
} from "@linxsimcity/trace-runtime";
import type { EventEnvelope } from "@linxsimcity/trace-schema";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { describe, expect, test } from "vitest";

import {
  buildInstructionVisuals,
  burstKindForVisual,
  dataTokenProgress,
  isInstructionLifecycleEvent,
} from "./instruction-layer.js";

const topology: TopologyDescriptor = {
  schemaVersion: "1.1.0",
  entities: [
    {
      id: "pe0.scalar.fetch",
      kind: "module",
      label: "fetch",
      instance: { index: 0 },
      placement: {
        district: "scalar",
        position: [1, 1, 1],
        size: [2, 1, 2],
      },
    },
    {
      id: "pe0.sperob.slot3",
      kind: "rob-slot",
      label: "ROB 3",
      instance: { index: 3 },
      placement: {
        district: "scalar",
        position: [5, 1, 1],
        size: [0.2, 0.4, 0.2],
      },
    },
    {
      id: "pe0.scalar.retire",
      kind: "module",
      label: "retire",
      instance: { index: 0 },
      placement: {
        district: "scalar",
        position: [9, 1, 1],
        size: [2, 1, 2],
      },
    },
  ],
};

function transition(
  type: InstructionTransition["type"],
  cycle: number,
  entityId: string,
): InstructionTransition {
  return { type, cycle, seq: 0, entityId, routeId: undefined };
}

function instruction(
  id: number,
  overrides: Partial<InstructionTraceState> = {},
): InstructionTraceState {
  return {
    id,
    threadId: 0,
    pc: 0x1000 + id,
    disassemblyId: "add",
    robSlot: 3,
    stage: "fetch",
    sourceRegisters: [],
    destinationRegisters: [],
    requestIds: [],
    routeIds: [],
    transitions: [transition("instruction.fetch", 10, "pe0.scalar.fetch")],
    completed: false,
    retired: false,
    squashed: false,
    lastCycle: 10,
    terminalCycle: undefined,
    ...overrides,
  };
}

function event(type: EventEnvelope["type"]): EventEnvelope {
  return {
    cycle: 10,
    seq: 0,
    type,
    scope: "scalar",
    entity_id: "pe0.scalar.fetch",
    payload: { instruction_id: 1, thread_id: 0 },
  };
}

describe("instruction render layer selection", () => {
  test.each([
    "instruction.fetch",
    "instruction.issue",
    "instruction.retire",
    "instruction.squash",
    "pipeline.enter",
    "pipeline.leave",
    "rob.allocate",
    "rob.flush",
    "register.read",
    "register.write",
  ] as const)("keeps %s out of request-token traffic", (type) => {
    expect(isInstructionLifecycleEvent(event(type))).toBe(true);
  });

  test.each([
    "memory.request",
    "memory.response",
    "cache.miss",
    "cell.grant",
    "crossbar.grant",
    "cube.stage",
    "pipe.transfer",
  ] as const)("keeps %s available to request-token traffic", (type) => {
    expect(isInstructionLifecycleEvent(event(type))).toBe(false);
  });

  test("produces one persistent visual per causal instruction", () => {
    const visuals = buildInstructionVisuals(
      [
        [1, instruction(1)],
        [2, instruction(2, { disassemblyId: "ld" })],
      ],
      10.5,
      topology,
    );

    expect(visuals).toHaveLength(2);
    expect(visuals.map((visual) => visual.instructionId)).toEqual([1, 2]);
    expect(visuals.map((visual) => visual.category)).toEqual([
      "scalar",
      "load",
    ]);
  });

  test("maps terminal visuals to distinct squash and retire bursts", () => {
    const retire = buildInstructionVisuals(
      [
        [
          1,
          instruction(1, {
            completed: true,
            retired: true,
            stage: "retire",
            terminalCycle: 10,
            transitions: [
              transition("instruction.retire", 10, "pe0.scalar.retire"),
            ],
          }),
        ],
      ],
      11.2,
      topology,
    )[0]!;
    const squash = buildInstructionVisuals(
      [
        [
          2,
          instruction(2, {
            squashed: true,
            stage: "squash",
            terminalCycle: 10,
            transitions: [
              transition("instruction.fetch", 9, "pe0.scalar.fetch"),
              transition("instruction.squash", 10, "pe0.sperob.slot3"),
            ],
          }),
        ],
      ],
      10.2,
      topology,
    )[0]!;

    expect(burstKindForVisual(retire)).toBe("retire");
    expect(burstKindForVisual(squash)).toBe("squash");
  });

  test("advances data traffic once in trace time instead of looping", () => {
    const transfer = {
      ...event("pipe.transfer"),
      cycle: 20,
      payload: { start_cycle: 20, end_cycle: 22 },
    } satisfies EventEnvelope;

    expect(dataTokenProgress(transfer, 20)).toBe(0);
    expect(dataTokenProgress(transfer, 21)).toBe(0.5);
    expect(dataTokenProgress(transfer, 22)).toBe(1);
    expect(dataTokenProgress(transfer, 120)).toBe(1);
  });
});
