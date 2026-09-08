import type { DecimalU64, SimTracePhase } from "./current-types.js";

export const SIM_TRACE_INDEX_SCHEMA = "linxsimcity.trace-index" as const;
export const SIM_TRACE_CHECKPOINT_SCHEMA =
  "linxsimcity.trace-checkpoint" as const;
export const SIM_TRACE_BUNDLE_VERSION = "1" as const;

export interface SimTraceChunkIndexEntry {
  readonly id: string;
  readonly path: string;
  readonly timeDomain: string;
  readonly firstCycle: DecimalU64;
  readonly lastCycle: DecimalU64;
  readonly eventCount: DecimalU64;
  readonly sha256: string;
  readonly compressedBytes: number;
  readonly checkpointId: string;
}

export interface SimTraceCheckpointIndexEntry {
  readonly id: string;
  readonly path: string;
  readonly timeDomain: string;
  readonly cycle: DecimalU64;
  readonly eventOrdinal: DecimalU64;
  readonly sha256: string;
  readonly compressedBytes: number;
}

export interface SimTraceIndex {
  readonly schema: typeof SIM_TRACE_INDEX_SCHEMA;
  readonly schemaVersion: typeof SIM_TRACE_BUNDLE_VERSION;
  readonly runId: string;
  readonly topologyFingerprint: string;
  readonly chunks: readonly SimTraceChunkIndexEntry[];
  readonly checkpoints: readonly SimTraceCheckpointIndexEntry[];
}

export interface SimTraceCheckpointState {
  readonly queueTokens: readonly {
    readonly tokenId: string;
    readonly queueId: string;
    readonly state: "accepted" | "visible";
    readonly slot: number;
  }[];
  readonly queueOccupancy: readonly {
    readonly queueId: string;
    readonly occupancy: number;
    readonly capacity: number;
  }[];
  readonly tileResidencies: readonly {
    readonly residencyId: string;
    readonly tileId: string;
    readonly version: DecimalU64;
    readonly storageNodeId: string;
    readonly allocationEpoch: DecimalU64;
    readonly bank?: number | undefined;
    readonly row?: number | undefined;
    readonly slot?: number | undefined;
    readonly address?: DecimalU64 | undefined;
    readonly byteOffset: number;
    readonly byteLength: number;
    readonly fragmentIndex: number;
    readonly fragmentCount: number;
  }[];
  readonly associations: readonly {
    readonly tokenId: string;
    readonly tileId: string;
    readonly version: DecimalU64;
    readonly relation: "produces" | "consumes" | "transfers";
  }[];
  readonly computations: readonly {
    readonly tokenId: string;
    readonly entityId: string;
    readonly operation: string;
    readonly inputTileIds: readonly string[];
    readonly outputTileIds: readonly string[];
    readonly startCycle: DecimalU64;
    readonly startPhase: SimTracePhase;
  }[];
}

export interface SimTraceCheckpoint {
  readonly schema: typeof SIM_TRACE_CHECKPOINT_SCHEMA;
  readonly schemaVersion: typeof SIM_TRACE_BUNDLE_VERSION;
  readonly runId: string;
  readonly topologyFingerprint: string;
  readonly timeDomain: string;
  readonly cycle: DecimalU64;
  readonly eventOrdinal: DecimalU64;
  readonly state: SimTraceCheckpointState;
}
