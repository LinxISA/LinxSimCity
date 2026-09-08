import { CORE_BRICK_BY_ID } from "@linxsimcity/component-catalog";
import { worldPosition } from "@linxsimcity/world";
import type { BrickInstance } from "@linxsimcity/world";
import { expect, test } from "vitest";

import {
  orthogonalRoute,
  portWorldPosition,
  rotateAnchor,
} from "./geometry.js";

test("quarter-turn rotation keeps port anchors exact", () => {
  expect(rotateAnchor([2, 0, 1], 0)).toEqual([2, 0, 1]);
  expect(rotateAnchor([2, 0, 1], 1)).toEqual([1, 0, -2]);
  expect(rotateAnchor([2, 0, 1], 2)).toEqual([-2, 0, -1]);
  expect(rotateAnchor([2, 0, 1], 3)).toEqual([-1, 0, 2]);
});

test("port positions follow a rotated brick", () => {
  const definition = CORE_BRICK_BY_ID.get("core.queue")!;
  const instance: BrickInstance = {
    id: "queue.1",
    definitionId: definition.id,
    parameters: { capacity: 8, latency: 1 },
    hierarchyDepth: 0,
    topologyRank: 0,
    topologyOrder: 0,
    laneId: "root",
    transform: {
      position: worldPosition(10, 0, 5),
      yawQuarterTurns: 1 as const,
    },
  };
  expect(portWorldPosition(instance, definition, "out")).toEqual([
    10, 1.1, 2.5,
  ]);
});

test("connection routing stays orthogonal in X, Y, and Z", () => {
  const points = orthogonalRoute([0, 1, 2], [10, 3, 8], 2);
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    expect(
      current.filter((value, axis) => value !== previous[axis]),
    ).toHaveLength(1);
  }
});
