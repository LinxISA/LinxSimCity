import { CORE_BRICK_BY_ID } from "@linxsimcity/component-catalog";
import { worldPosition } from "@linxsimcity/world";
import { describe, expect, test } from "vitest";

import {
  circularEntryLayout,
  entryIsOccupied,
  layeredEntryLayout,
  linearEntryLayout,
  logicalEntryCount,
  matrixEntryLayout,
} from "./entry-layout.js";

const size = { x: 6, y: 3, z: 4 } as const;

describe("entry layouts", () => {
  test("renders a bounded one-dimensional table strip", () => {
    const entries = linearEntryLayout(64, size, 16);
    expect(entries).toHaveLength(16);
    expect(new Set(entries.map((entry) => entry.position[2]))).toEqual(
      new Set([0]),
    );
    expect(entries[0]!.logicalIndex).toBe(0);
    expect(entries.at(-1)!.logicalIndex).toBe(63);
  });

  test("renders two topology dimensions as a bounded matrix", () => {
    const entries = matrixEntryLayout(8, 4, size, 32);
    expect(entries).toHaveLength(32);
    expect(new Set(entries.map((entry) => entry.position[0])).size).toBe(8);
    expect(new Set(entries.map((entry) => entry.position[2])).size).toBe(4);
  });

  test("renders higher-dimensional tables as bounded stacked layers", () => {
    const entries = layeredEntryLayout([4, 4, 3], size, 36);
    expect(entries.length).toBeLessThanOrEqual(36);
    expect(new Set(entries.map((entry) => entry.position[1])).size).toBe(3);
  });

  test("places ROB entries on a circular buffer", () => {
    const entries = circularEntryLayout(64, size, 32);
    expect(entries).toHaveLength(32);
    const radii = entries.map((entry) =>
      Math.hypot(entry.position[0], entry.position[2]),
    );
    radii.forEach((radius) => expect(radius).toBeCloseTo(1.52));
  });

  test("uses catalog visual dimensions instead of labels", () => {
    const definition = CORE_BRICK_BY_ID.get("ac.dependency")!;
    const instance = {
      id: "block.scheduler",
      definitionId: definition.id,
      parameters: { capacity: 8, resources: 4 },
      hierarchyDepth: 1,
      topologyRank: 0,
      topologyOrder: 0,
      laneId: "scope.dependency",
      transform: { position: worldPosition(0, 0, 0), yawRadians: 0 },
    };
    expect(logicalEntryCount(instance, definition)).toBe(32);
  });

  test("lights a contiguous circular occupancy window", () => {
    const activity = {
      source: "preview",
      occupiedEntries: 3,
      headIndex: 6,
    } as const;
    expect(
      [5, 6, 7, 0, 1].map((index) => entryIsOccupied(index, 8, activity)),
    ).toEqual([false, true, true, true, false]);
  });
});
