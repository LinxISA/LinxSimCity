import { CORE_BRICK_BY_ID } from "@linxsimcity/component-catalog";
import { positionToTuple, worldPosition } from "@linxsimcity/world";
import type { BrickInstance } from "@linxsimcity/world";
import { expect, test } from "vitest";

import {
  districtColor,
  orthogonalRoute,
  portWorldPosition,
  QUEUE_ROUTE_DECK_Y,
  rotateAnchor,
} from "./geometry.js";
import { localizeWorldForRendering } from "./scene-origin.js";

test("hierarchy district colors are stable and root remains neutral", () => {
  expect(districtColor("scope.root", 0)).toBe("#456677");
  expect(districtColor("scope.frontend", 1)).toBe(
    districtColor("scope.frontend", 1),
  );
  const colors = new Set(
    [
      "frontend",
      "dependency",
      "dispatch",
      "scalar",
      "vector",
      "cube",
      "tma",
      "retire",
    ].map((scope) => districtColor(`scope.${scope}`, 1)),
  );
  expect(colors.size).toBeGreaterThanOrEqual(4);
});

test("continuous Y rotation keeps port anchors aligned", () => {
  const cases = [
    [0, [2, 0, 1]],
    [Math.PI / 2, [1, 0, -2]],
    [Math.PI, [-2, 0, -1]],
    [(3 * Math.PI) / 2, [-1, 0, 2]],
  ] as const;
  for (const [angle, expected] of cases) {
    rotateAnchor([2, 0, 1], angle).forEach((value, index) =>
      expect(value).toBeCloseTo(expected[index]!),
    );
  }
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
      yawRadians: Math.PI / 2,
    },
  };
  portWorldPosition(instance, definition, "out").forEach((value, index) =>
    expect(value).toBeCloseTo([10, 2.2, 2.5][index]!),
  );
});

test("connection routing stays orthogonal in X, Y, and Z", () => {
  const points = orthogonalRoute([0, 1, 2], [10, 3, 8]);
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    expect(
      current.filter((value, axis) => value !== previous[axis]),
    ).toHaveLength(1);
  }
});

test("queue routes share a deck above the module roofs", () => {
  const points = orthogonalRoute([0, 2, 0], [10, 5, 8], QUEUE_ROUTE_DECK_Y);
  expect(
    points.slice(1, -1).every((point) => point[1] === QUEUE_ROUTE_DECK_Y),
  ).toBe(true);
});

test("equal-height module ports produce no rising or falling pipe segments", () => {
  const points = orthogonalRoute([0, 8, 2], [10, 8, 8], 8);
  expect(points.every((point) => point[1] === 8)).toBe(true);
});

test("scene localization keeps large logical coordinates out of GPU geometry", () => {
  const definition = CORE_BRICK_BY_ID.get("core.vector")!;
  const instance = (id: string, x: number, y: number, z: number) => ({
    id,
    definitionId: definition.id,
    parameters: { lanes: 8 },
    hierarchyDepth: 0,
    topologyRank: 0,
    topologyOrder: 0,
    laneId: "root",
    transform: { position: worldPosition(x, y, z), yawRadians: 0 },
  });
  const first = instance("vector.negative", -1_000_020, 999_990, -1_000_030);
  const selected = instance(
    "vector.selected",
    -1_000_000,
    1_000_000,
    -1_000_000,
  );
  const world = {
    schema: "linxsimcity.generated-world",
    schemaVersion: "1",
    topologyId: "large-coordinates",
    topologyRevision: "1",
    topologyFingerprint: "fnv1a64:stable",
    name: "Large coordinates",
    instances: [first, selected],
    links: [],
    queueCorridors: [],
  } as const;

  const localized = localizeWorldForRendering(world, selected.id);
  expect(localized).not.toBe(world);
  expect(localized.topologyFingerprint).toBe(world.topologyFingerprint);
  expect(positionToTuple(localized.instances[0]!.transform.position)).toEqual([
    -20, -10, -30,
  ]);
  expect(positionToTuple(localized.instances[1]!.transform.position)).toEqual([
    0, 0, 0,
  ]);
  expect(positionToTuple(world.instances[0]!.transform.position)).toEqual([
    -1_000_020, 999_990, -1_000_030,
  ]);
});
