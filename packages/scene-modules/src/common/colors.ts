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

const EVENT_STATUS: Readonly<Record<string, string>> = {
  "register.read": "read",
  "register.write": "write",
  "register.ready": "grant",
  "cache.access": "active",
  "cache.hit": "hit",
  "cache.miss": "miss",
  "cache.fill": "fill",
  "cache.writeback": "write",
  "cell.read": "read",
  "cell.write": "write",
  "cell.grant": "grant",
  "cell.conflict": "conflict",
  "rob.retire": "retire",
  "rob.flush": "flush",
};

const FEEDBACK_CYCLES = 6;

function lerpChannel(from: number, to: number, progress: number): number {
  return Math.round(from + (to - from) * progress);
}

function lerpColor(from: number, to: number, progress: number): number {
  const u = Math.max(0, Math.min(1, progress));
  return (
    (lerpChannel((from >> 16) & 0xff, (to >> 16) & 0xff, u) << 16) |
    (lerpChannel((from >> 8) & 0xff, (to >> 8) & 0xff, u) << 8) |
    lerpChannel(from & 0xff, to & 0xff, u)
  );
}

export function stateMap(
  snapshot: SerializedViewerSnapshot | undefined,
): ReadonlyMap<string, EntityState> {
  return new Map(snapshot?.entities ?? []);
}

export function colorForState(
  state: EntityState | undefined,
  baseColor: number,
  selected: boolean,
  cycle?: number,
): number {
  if (selected) return 0xffffff;
  if (!state?.available) return 0x151922;
  const eventStatus = state.lastEvent
    ? EVENT_STATUS[state.lastEvent.type]
    : undefined;
  if (cycle !== undefined && state.lastEvent && eventStatus) {
    const age = cycle - state.lastEvent.cycle;
    if (age >= 0 && age < FEEDBACK_CYCLES) {
      const peak = STATUS_COLORS[eventStatus] ?? baseColor;
      return lerpColor(peak, baseColor, age / FEEDBACK_CYCLES);
    }
    if (age === FEEDBACK_CYCLES) return baseColor;
  }
  return STATUS_COLORS[state.status] ?? baseColor;
}
