import type {
  InstructionTraceState,
  InstructionTransition,
} from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor, TopologyEntity } from "@linxsimcity/topology";
import { describe, expect, test } from "vitest";

import {
  instructionCategory,
  planInstructionMotion,
} from "./instruction-motion.js";

function entity(
  id: string,
  kind: TopologyEntity["kind"],
  position: [number, number, number],
): TopologyEntity {
  return {
    id,
    kind,
    label: id,
    instance: { index: 0 },
    placement: {
      district: "scalar",
      position,
      size: [2, 1, 2],
    },
  };
}

const topology: TopologyDescriptor = {
  schemaVersion: "1.1.0",
  entities: [
    entity("pe2.scalar.fetch", "module", [0, 1, 0]),
    entity("pe2.scalar.decode", "module", [4, 1, 0]),
    entity("pe2.scalar.retire", "module", [16, 1, 0]),
    entity("pe2.sperob.slot47", "rob-slot", [12, 1, 0]),
    {
      id: "pe2.scalar.pipe.alu",
      kind: "pipe",
      label: "ALU pipe",
      instance: { index: 0 },
      route: {
        style: "orthogonal",
        fromPortId: "issue.out",
        toPortId: "execute.in",
        points: [
          [6, 2, 0],
          [10, 2, 0],
          [10, 2, 4],
        ],
      },
    },
  ],
};

function transition(
  cycle: number,
  seq: number,
  type: InstructionTransition["type"],
  entityId: string,
  routeId?: string,
): InstructionTransition {
  return { cycle, seq, type, entityId, routeId };
}

function instruction(
  transitions: readonly InstructionTransition[],
  overrides: Partial<InstructionTraceState> = {},
): InstructionTraceState {
  return {
    id: 91,
    threadId: 2,
    pc: 0x1000,
    disassemblyId: "add",
    robSlot: 47,
    stage: "issue",
    sourceRegisters: [],
    destinationRegisters: [],
    requestIds: [],
    routeIds: [],
    transitions,
    completed: false,
    retired: false,
    squashed: false,
    lastCycle: transitions.at(-1)?.cycle ?? 0,
    terminalCycle: undefined,
    ...overrides,
  };
}

describe("instruction lifecycle motion", () => {
  test.each([
    ["add", "scalar"],
    ["ld", "load"],
    ["tstore", "store"],
    ["BSTART", "branch"],
    ["vfmul", "vector"],
    ["GMMA.LD", "cube"],
  ] as const)("classifies %s as %s", (mnemonic, expected) => {
    expect(instructionCategory(mnemonic)).toBe(expected);
  });

  test("moves along the exact orthogonal execution route by trace-cycle age", () => {
    const visual = planInstructionMotion(
      instruction([
        transition(10, 0, "instruction.fetch", "pe2.scalar.fetch"),
        transition(
          12,
          0,
          "instruction.issue",
          "pe2.scalar.pipe.alu",
          "pe2.scalar.pipe.alu",
        ),
      ]),
      12.375,
      topology,
    );

    expect(visual?.position).toEqual([10, 2, 0]);
    expect(visual?.overlay).toBe("normal");
  });

  test("parks a completed instruction in its physical ROB slot", () => {
    const visual = planInstructionMotion(
      instruction(
        [transition(20, 0, "instruction.complete", "pe2.scalar.fetch")],
        { completed: true, stage: "complete" },
      ),
      20.8,
      topology,
    );

    expect(visual?.position).toEqual([12, 1, 0]);
    expect(visual?.scale).toBe(1);
  });

  test("jumps from the ROB to retire and emits a shrinking retire state", () => {
    const visual = planInstructionMotion(
      instruction(
        [transition(30, 0, "instruction.retire", "pe2.scalar.retire")],
        {
          completed: true,
          retired: true,
          stage: "retire",
          terminalCycle: 30,
        },
      ),
      30.55,
      topology,
    );

    expect(visual?.position[0]).toBeCloseTo(14);
    expect(visual?.position[1]).toBeGreaterThan(2.5);
    expect(visual?.overlay).toBe("retire");
    expect(visual?.terminalProgress).toBeCloseTo(0.5);
  });

  test("holds a squash at its last real location before expanding and dying", () => {
    const state = instruction(
      [
        transition(40, 0, "instruction.decode", "pe2.scalar.decode"),
        transition(41, 0, "instruction.squash", "pe2.sperob.slot47"),
      ],
      { squashed: true, stage: "squash", terminalCycle: 41 },
    );

    const flash = planInstructionMotion(state, 41.1, topology);
    const gone = planInstructionMotion(state, 41.7, topology);

    expect(flash?.position).toEqual([4, 2, 0]);
    expect(flash?.scale).toBeGreaterThan(1);
    expect(flash?.overlay).toBe("squash");
    expect(gone?.scale).toBe(0);
  });
});
