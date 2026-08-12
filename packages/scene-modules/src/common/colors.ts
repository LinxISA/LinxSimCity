import type {
  EntityState,
  SerializedViewerSnapshot,
} from "@linxsimcity/trace-runtime";

export const STATUS_COLORS: Readonly<Record<string, number>> = {
  idle: 0x173247,
  occupied: 0x286d8e,
  allocated: 0x7a5cff,
  active: 0x2bd8ff,
  fetch: 0x6f72ff,
  decode: 0x8c72ff,
  rename: 0xad72ff,
  dispatch: 0xffbe4b,
  issue: 0xffd65c,
  complete: 0x54efaf,
  retire: 0x47e49e,
  read: 0x22bff5,
  write: 0xffb23e,
  grant: 0x54efaf,
  conflict: 0xff345f,
  stalled: 0xff345f,
  miss: 0xff345f,
  hit: 0x55eaa8,
  fill: 0x40bfff,
  flush: 0xff5b7b,
  transfer: 0x59d9ff,
};

export function stateMap(
  snapshot: SerializedViewerSnapshot | undefined,
): ReadonlyMap<string, EntityState> {
  return new Map(snapshot?.entities ?? []);
}

export function colorForState(
  state: EntityState | undefined,
  baseColor: number,
  selected: boolean,
): number {
  if (selected) return 0xffffff;
  if (!state?.available) return 0x151922;
  return STATUS_COLORS[state.status] ?? baseColor;
}
