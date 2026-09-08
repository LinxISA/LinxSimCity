import type { BrickDefinition } from "@linxsimcity/component-catalog";
import type { BrickInstance } from "@linxsimcity/world";
import { positionToTuple } from "@linxsimcity/world";

export function rotateAnchor(
  anchor: readonly [number, number, number],
  quarterTurns: number,
): readonly [number, number, number] {
  const turn = ((quarterTurns % 4) + 4) % 4;
  if (turn === 1) return [anchor[2], anchor[1], -anchor[0]];
  if (turn === 2) return [-anchor[0], anchor[1], -anchor[2]];
  if (turn === 3) return [-anchor[2], anchor[1], anchor[0]];
  return anchor;
}

export function portWorldPosition(
  instance: BrickInstance,
  definition: BrickDefinition,
  portId: string,
): readonly [number, number, number] {
  const port = definition.ports.find((item) => item.id === portId);
  if (!port) throw new Error(`port ${definition.id}.${portId} does not exist`);
  const base = positionToTuple(instance.transform.position);
  const anchor = rotateAnchor(port.anchor, instance.transform.yawQuarterTurns);
  return [
    base[0] + anchor[0],
    base[1] + definition.size.y / 2 + anchor[1],
    base[2] + anchor[2],
  ];
}

export function orthogonalRoute(
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  lane = 0,
): readonly (readonly [number, number, number])[] {
  const travelY = Math.max(start[1], end[1]) + 1.5 + (lane % 7) * 0.18;
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
