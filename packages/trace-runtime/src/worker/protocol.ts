import type {
  DecimalU64,
  SimTraceEvent,
  SimTraceIndex,
  SimTraceManifest,
} from "@linxsimcity/trace-schema";
import type { ArchitectureTopology } from "@linxsimcity/world";

import type { TraceBundleSource } from "../bundle/types.js";
import type { SimTraceSnapshot } from "../reducer/state.js";

export type WorkerTraceSource = TraceBundleSource;

export interface LoadedTraceInfo {
  readonly manifest: SimTraceManifest;
  readonly topology: ArchitectureTopology;
  readonly index: SimTraceIndex;
}

/** A reducer snapshot containing only structured-clone-safe JSON values. */
export type SerializedSimTraceSnapshot = SimTraceSnapshot;

export interface WorkerDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly fatal: boolean;
  readonly path?: string;
  readonly details?: unknown;
}

export interface TraceWorkerApi {
  load(source: WorkerTraceSource): Promise<LoadedTraceInfo>;
  seek(
    timeDomain: string,
    cycle: DecimalU64,
    requestId: number,
  ): Promise<SerializedSimTraceSnapshot>;
  eventsAt(
    timeDomain: string,
    cycle: DecimalU64,
  ): Promise<readonly SimTraceEvent[]>;
  entityHistory(
    timeDomain: string,
    entityId: string,
    from: DecimalU64,
    to: DecimalU64,
  ): Promise<readonly SimTraceEvent[]>;
  close(): Promise<void>;
}
