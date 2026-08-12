export const CACHE_LINE_COUNT = 1_024;
export const SPEROB_SLOT_COUNT = 128;

export const scalarPipeline = [
  { id: "fetch", label: "Fetch F0–F3", z: -17 },
  { id: "decode", label: "Decode", z: -11 },
  { id: "rename", label: "Rename + PRF", z: -5 },
  { id: "iq", label: "IEX IQ", z: 1 },
  { id: "execute", label: "INT · FP · LSU", z: 7 },
  { id: "rob", label: "SPEROB", z: 14 },
  { id: "commit", label: "Commit", z: 20 },
] as const;

export function cacheEntityIds(cache: "l1i" | "l1d"): readonly string[] {
  return Array.from({ length: CACHE_LINE_COUNT }, (_, instanceId) => {
    const set = Math.floor(instanceId / 4);
    const way = instanceId % 4;
    return `core.scalar.${cache}.set${set}.way${way}`;
  });
}

export function robAngle(slot: number): number {
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= SPEROB_SLOT_COUNT) {
    throw new RangeError(`ROB slot must be in 0..${SPEROB_SLOT_COUNT - 1}`);
  }
  return (slot / SPEROB_SLOT_COUNT) * Math.PI * 2 - Math.PI / 2;
}

export function robEntityIds(): readonly string[] {
  return Array.from(
    { length: SPEROB_SLOT_COUNT },
    (_, slot) => `core.scalar.sperob.slot${slot}`,
  );
}
