import { WORLD_CHUNK_SIZE } from "./types.js";
import type { AxisPosition, WorldPosition } from "./types.js";

function safeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`);
  }
}

export function normalizeAxis(chunk: number, local: number): AxisPosition {
  safeInteger(chunk, "chunk");
  safeInteger(local, "local position");
  const offset = Math.floor(local / WORLD_CHUNK_SIZE);
  return {
    chunk: chunk + offset,
    local: local - offset * WORLD_CHUNK_SIZE,
  };
}

export function worldPosition(x: number, y: number, z: number): WorldPosition {
  return {
    x: normalizeAxis(0, x),
    y: normalizeAxis(0, y),
    z: normalizeAxis(0, z),
  };
}

export function axisToNumber(axis: AxisPosition): number {
  return axis.chunk * WORLD_CHUNK_SIZE + axis.local;
}

export function positionToTuple(
  position: WorldPosition,
): readonly [number, number, number] {
  return [
    axisToNumber(position.x),
    axisToNumber(position.y),
    axisToNumber(position.z),
  ];
}

export function addPosition(
  position: WorldPosition,
  delta: readonly [number, number, number],
): WorldPosition {
  return {
    x: normalizeAxis(position.x.chunk, position.x.local + delta[0]),
    y: normalizeAxis(position.y.chunk, position.y.local + delta[1]),
    z: normalizeAxis(position.z.chunk, position.z.local + delta[2]),
  };
}
