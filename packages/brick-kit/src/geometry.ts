import type { BrickDefinition } from "@linxsimcity/component-catalog";
import type { BrickInstance } from "@linxsimcity/world";
import { positionToTuple } from "@linxsimcity/world";

const DISTRICT_COLORS = [
  "#48b8d0",
  "#5fc49a",
  "#7c8fe8",
  "#b77bd8",
  "#d89859",
  "#cf6f78",
  "#65a8e8",
  "#9aa85e",
] as const;

export const QUEUE_VISUAL_ELEVATION = 4;
export const QUEUE_ROUTE_DECK_Y = 8;

export function districtColor(id: string, depth: number): string {
  if (depth === 0) return "#456677";
  let hash = 2166136261;
  for (const character of id) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return DISTRICT_COLORS[Math.abs(hash) % DISTRICT_COLORS.length]!;
}

export function rotateAnchor(
  anchor: readonly [number, number, number],
  yawRadians: number,
): readonly [number, number, number] {
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);
  return [
    anchor[0] * cosine + anchor[2] * sine,
    anchor[1],
    -anchor[0] * sine + anchor[2] * cosine,
  ];
}

export function portWorldPosition(
  instance: BrickInstance,
  definition: BrickDefinition,
  portId: string,
): readonly [number, number, number] {
  const port = definition.ports.find((item) => item.id === portId);
  if (!port) throw new Error(`port ${definition.id}.${portId} does not exist`);
  const base = positionToTuple(instance.transform.position);
  const anchor = rotateAnchor(port.anchor, instance.transform.yawRadians);
  const visualElevation =
    definition.kind === "queue" ? QUEUE_VISUAL_ELEVATION : 0;
  return [
    base[0] + anchor[0],
    base[1] + visualElevation + definition.size.y / 2 + anchor[1],
    base[2] + anchor[2],
  ];
}

export function orthogonalRoute(
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  lane = 0,
  minimumDeckY = 0,
): readonly (readonly [number, number, number])[] {
  const travelY =
    Math.max(start[1], end[1], minimumDeckY) + 1.25 + (lane % 7) * 0.18;
  const bendX = start[0] + (end[0] - start[0]) * 0.5;
  const points: (readonly [number, number, number])[] = [
    start,
    [start[0], travelY, start[2]],
    [bendX, travelY, start[2]],
    [bendX, travelY, end[2]],
    [end[0], travelY, end[2]],
    end,
  ];
  return points.filter(
    (point, index) =>
      index === 0 ||
      point.some((value, axis) => value !== points[index - 1]![axis]),
  );
}
