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
