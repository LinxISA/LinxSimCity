import { describe, expect, test } from "vitest";

import type { BrickActivity, EntryVisual } from "./entry-layout.js";
import {
  entryIsOccupied,
  linearEntryLayout,
  logicalEntryVisual,
  matrixEntryLayout,
} from "./entry-layout.js";
import {
  entryDetailBudget,
  groupEntryInstances,
  includePriorityEntries,
  logicalIndexForInstance,
} from "./entry-instancing.js";

const size = { x: 6, y: 3, z: 4 } as const;

describe("entry instancing", () => {
  test("applies bounded near, medium, and far instance budgets", () => {
    expect(entryDetailBudget(20, 65_536, 48)).toEqual({
      level: "near",
      visibleEntries: 48,
    });
    expect(entryDetailBudget(60, 65_536, 48)).toEqual({
      level: "medium",
      visibleEntries: 24,
    });
    expect(entryDetailBudget(120, 65_536, 48)).toEqual({
      level: "far",
      visibleEntries: 12,
    });
  });

  test("never creates more instances than logical entries", () => {
    expect(entryDetailBudget(20, 3, 48).visibleEntries).toBe(3);
  });

  test("caps the complete occupied and empty instance set at the LOD budget", () => {
    const budget = entryDetailBudget(120, 65_536, 48);
    const entries = linearEntryLayout(65_536, size, budget.visibleEntries);
    const groups = groupEntryInstances(
      entries,
      65_536,
      { source: "preview", occupiedEntries: 30_000, headIndex: 0 },
      entryIsOccupied,
    );
    expect(
      groups.reduce((count, group) => count + group.entries.length, 0),
    ).toBe(12);
  });

  test("keeps trace-active logical indices in the sampled view", () => {
    const sampled = linearEntryLayout(256, size, 8);
    const prioritized = includePriorityEntries(
      sampled,
      256,
      [17, 93, 211],
      (logicalIndex) =>
        logicalEntryVisual("linear", logicalIndex, [256], size, 8),
    );
    expect(prioritized).toHaveLength(8);
    expect(prioritized.map((entry) => entry.logicalIndex)).toEqual(
      expect.arrayContaining([17, 93, 211]),
    );
  });

  test("groups occupied and empty instances while retaining picking maps", () => {
    const entries: readonly EntryVisual[] = linearEntryLayout(8, size, 8);
    const activity: BrickActivity = {
      source: "trace",
      occupiedEntries: 2,
      headIndex: 0,
      activeEntryIndices: [2, 6],
    };
    const [occupied, empty] = groupEntryInstances(
      entries,
      8,
      activity,
      entryIsOccupied,
    );

    expect(occupied.state).toBe("occupied");
    expect(occupied.logicalIndexByInstance).toEqual([2, 6]);
    expect(empty.logicalIndexByInstance).toEqual([0, 1, 3, 4, 5, 7]);
    expect(logicalIndexForInstance(occupied, 1)).toBe(6);
    expect(logicalIndexForInstance(empty, 4)).toBe(5);
    expect(logicalIndexForInstance(empty, 99)).toBeUndefined();
  });

  test("keeps B4/R1949 at its physical position and pickable across LOD regrouping", () => {
    const dimensions = [8, 4096] as const;
    const target = 4 * dimensions[1] + 1949;
    const activity: BrickActivity = {
      source: "trace",
      occupiedEntries: 1,
      headIndex: 0,
      activeEntryIndices: [target],
    };
    const expected = logicalEntryVisual("matrix", target, dimensions, size, 32);

    for (const budget of [32, 8]) {
      const sampled = matrixEntryLayout(
        dimensions[0],
        dimensions[1],
        size,
        budget,
      );
      const entries = includePriorityEntries(
        sampled,
        dimensions[0] * dimensions[1],
        [target],
        (logicalIndex) =>
          logicalEntryVisual("matrix", logicalIndex, dimensions, size, budget),
      );
      const [occupied] = groupEntryInstances(
        entries,
        dimensions[0] * dimensions[1],
        activity,
        entryIsOccupied,
      );
      const instanceIndex = occupied.logicalIndexByInstance.indexOf(target);

      expect(logicalIndexForInstance(occupied, instanceIndex)).toBe(target);
      expect(occupied.entries[instanceIndex]!.position).toEqual(
        expected.position,
      );
    }
  });
});
