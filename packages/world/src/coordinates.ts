import { WORLD_CHUNK_SIZE } from "./types.js";
import type { AxisPosition, LocalPosition, WorldPosition } from "./types.js";

function safeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`);
  }
}

export function normalizeAxis(chunk: number, local: number): AxisPosition {
  safeInteger(chunk, "chunk");
  safeInteger(local, "local position");
  const offset = Math.floor(local / WORLD_CHUNK_SIZE);
  const normalizedChunk = chunk + offset;
  safeInteger(normalizedChunk, "normalized chunk");
  return {
    chunk: normalizedChunk,
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
  const value = axis.chunk * WORLD_CHUNK_SIZE + axis.local;
  safeInteger(value, "world position");
  return value;
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

export function axisRelativeTo(
  position: AxisPosition,
  origin: AxisPosition,
): number {
  safeInteger(position.chunk, "position chunk");
  safeInteger(position.local, "position local");
  safeInteger(origin.chunk, "origin chunk");
  safeInteger(origin.local, "origin local");
  const chunkDelta = position.chunk - origin.chunk;
  safeInteger(chunkDelta, "relative chunk");
  const relative =
    chunkDelta * WORLD_CHUNK_SIZE + position.local - origin.local;
  safeInteger(relative, "relative position");
  return relative;
}

/**
 * Converts an authoritative chunk/local position to a small scene-space tuple.
 * The subtraction happens before chunk expansion so a distant logical origin is
 * never uploaded to the renderer as an absolute GPU coordinate.
 */
export function positionRelativeTo(
  position: WorldPosition,
  origin: WorldPosition,
): LocalPosition {
  return [
    axisRelativeTo(position.x, origin.x),
    axisRelativeTo(position.y, origin.y),
    axisRelativeTo(position.z, origin.z),
  ];
}
