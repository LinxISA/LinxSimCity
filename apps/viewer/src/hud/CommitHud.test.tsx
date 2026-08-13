// @vitest-environment jsdom

import type { InstructionTraceState } from "@linxsimcity/trace-runtime";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { CommitHud } from "./CommitHud.js";

const instruction: InstructionTraceState = {
  id: 42,
  threadId: 3,
  pc: 0x1040,
  disassemblyId: "fa",
  robSlot: 7,
  stage: "retire",
  sourceRegisters: [5, 6],
  destinationRegisters: [9],
  requestIds: [],
  routeIds: ["pe3.scalar.pipe.alu"],
  completed: true,
  retired: true,
  squashed: false,
  lastCycle: 88,
  terminalCycle: 88,
};

afterEach(cleanup);

test("shows live commit and pinned trace without replacing either", () => {
  render(
    <CommitHud
      liveCommit={instruction}
      pinnedInstructionId={42}
      recentCommits={Array.from({ length: 12 }, (_, index) => ({
        ...instruction,
        id: index,
      }))}
      snapshot={{
        cycle: 88,
        entities: [],
        activeEvents: [],
        changedEntityIds: [],
        profileAvailability: { overview: true, pipeline: true, forensic: true },
        causal: {
          instructions: [[42, instruction]],
          requests: [],
          robs: [],
          prfs: [],
          caches: [],
          cells: [],
          activeRoutes: [],
        },
      }}
    />,
  );
  expect(screen.getByText("LIVE COMMIT")).toBeTruthy();
  expect(screen.getByText("PINNED TRACE")).toBeTruthy();
  expect(screen.getAllByRole("listitem")).toHaveLength(8);
  expect(screen.getAllByText(/pe3\.scalar\.pipe\.alu/)).toHaveLength(2);
});
