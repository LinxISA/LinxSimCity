import { CORE_BRICK_BY_ID } from "@linxsimcity/component-catalog";
import { worldPosition } from "@linxsimcity/world";
import type { BrickInstance } from "@linxsimcity/world";
import { expect, test } from "vitest";

import { portWorldPosition, rotateAnchor } from "./geometry.js";

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
    transform: {
      position: worldPosition(10, 0, 5),
      yawQuarterTurns: 1 as const,
    },
  };
  expect(portWorldPosition(instance, definition, "out")).toEqual([
    10, 1.1, 2.5,
  ]);
});
