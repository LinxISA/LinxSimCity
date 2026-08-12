// @vitest-environment jsdom

import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { Inspector } from "./Inspector.js";

afterEach(cleanup);

const topology: TopologyDescriptor = {
  schemaVersion: "1.0.0",
  entities: [
    {
      id: "core.scalar.rob.slot0",
      kind: "rob-slot",
      label: "ROB Slot 0",
      instance: { index: 0 },
      ports: [{ id: "commit", direction: "out", widthBytes: 16 }],
    },
  ],
};

const snapshot: SerializedViewerSnapshot = {
  cycle: 9,
  entities: [
    [
      "core.scalar.rob.slot0",
      {
        id: "core.scalar.rob.slot0",
        kind: "rob-slot",
        label: "ROB Slot 0",
        status: "stalled",
        steadyStatus: "allocated",
        available: true,
        occupancy: 1,
        stage: "commit",
        data: { request_id: 42, stall_reason: "head dependency" },
      },
    ],
  ],
  activeEvents: [
    {
      cycle: 9,
      seq: 0,
      type: "pipeline.stall",
      scope: "core0",
      entity_id: "core.scalar.rob.slot0",
      payload: { request_id: 42, stall_reason: "head dependency" },
    },
  ],
  changedEntityIds: ["core.scalar.rob.slot0"],
  profileAvailability: { overview: true, pipeline: true, forensic: false },
};

test("Demo mode presents the current selected state", () => {
  render(
    <Inspector
      mode="demo"
      selectedEntityId="core.scalar.rob.slot0"
      snapshot={snapshot}
      topology={topology}
    />,
  );
  expect(screen.getByRole("heading").textContent).toContain("ROB Slot 0");
  expect(screen.getByText(/stalled/i)).toBeTruthy();
  expect(screen.queryByText(/request_id/i)).toBeNull();
});

test("Expert mode adds structural fields, payload, and unavailable profile copy", () => {
  render(
    <Inspector
      mode="expert"
      selectedEntityId="core.scalar.rob.slot0"
      snapshot={snapshot}
      topology={topology}
    />,
  );
  expect(screen.getByText("core.scalar.rob.slot0")).toBeTruthy();
  expect(screen.getAllByText(/head dependency/i)).toHaveLength(2);
  expect(screen.getByText(/forensic profile unavailable/i)).toBeTruthy();
  expect(screen.getAllByText(/request_id/i)).toHaveLength(2);
});
