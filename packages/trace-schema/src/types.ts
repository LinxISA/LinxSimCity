export const TRACE_PROFILES = ["overview", "pipeline", "forensic"] as const;

export type TraceProfile = (typeof TRACE_PROFILES)[number];

export const TRACE_EVENT_TYPES = [
  "instruction.fetch",
  "instruction.decode",
  "instruction.rename",
  "instruction.dispatch",
  "instruction.issue",
  "instruction.complete",
  "instruction.retire",
  "instruction.squash",
  "pipeline.enter",
  "pipeline.leave",
  "pipeline.stall",
  "queue.allocate",
  "queue.release",
  "queue.occupancy",
  "queue.full",
  "rob.allocate",
  "rob.head",
  "rob.tail",
  "rob.retire",
  "rob.flush",
  "register.read",
  "register.write",
  "register.ready",
  "cache.access",
  "cache.hit",
  "cache.miss",
  "cache.fill",
  "cache.writeback",
  "cell.read",
  "cell.write",
  "cell.grant",
  "cell.conflict",
  "crossbar.request",
  "crossbar.grant",
  "cube.dispatch",
  "cube.stage",
  "cube.complete",
  "cube.writeback",
  "vector.dispatch",
  "vector.stage",
  "vector.complete",
  "vector.writeback",
  "memory.request",
  "memory.response",
  "pipe.transfer",
  "flush.begin",
  "flush.end",
  "marker.user",
] as const;

export type TraceEventType = (typeof TRACE_EVENT_TYPES)[number];

export interface EventEnvelope<
  T extends TraceEventType = TraceEventType,
  P = unknown,
> {
  cycle: number;
  seq: number;
  type: T;
  scope: string;
  entity_id: string;
  payload: P;
}

export interface TraceManifest {
  schemaVersion: string;
  modelVersion: string;
  profile: TraceProfile;
  firstCycle: number;
  lastCycle: number;
  eventCount: number;
  chunkCount: number;
  chunkCycleSpan: number;
  checkpointCycleSpan: number;
}

export interface ChunkIndexEntry {
  path: string;
  firstCycle: number;
  lastCycle: number;
  eventCount: number;
  compressedBytes: number;
  sha256: string;
  checkpointPath: string;
}

export interface TraceIndex {
  schemaVersion: string;
  chunks: ChunkIndexEntry[];
}

export interface CheckpointState {
  cycle: number;
  seq: number;
  entities: Record<string, unknown>;
}
