import type {
  EventEnvelope,
  TraceIndex,
  TraceManifest,
} from "@linxsimcity/trace-schema";
import type { TopologyDescriptor } from "@linxsimcity/topology";

import type { TraceBundleSource } from "../bundle/types.js";
import type { EntityState } from "../reducer/state.js";
import type { SerializableCausalState } from "../causal/types.js";

export type WorkerTraceSource = TraceBundleSource;

export interface LoadedTraceInfo {
  readonly manifest: TraceManifest;
  readonly topology: TopologyDescriptor;
  readonly index: TraceIndex;
}

export interface SerializedViewerSnapshot {
  readonly cycle: number;
  readonly entities: readonly (readonly [string, EntityState])[];
  readonly activeEvents: readonly EventEnvelope[];
  readonly changedEntityIds: readonly string[];
  readonly profileAvailability: Readonly<{
    overview: boolean;
    pipeline: boolean;
    forensic: boolean;
  }>;
  readonly causal: SerializableCausalState;
}

export interface WorkerDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly fatal: boolean;
  readonly path?: string;
  readonly details?: unknown;
}

export interface TraceWorkerApi {
  load(source: WorkerTraceSource): Promise<LoadedTraceInfo>;
  seek(cycle: number, requestId: number): Promise<SerializedViewerSnapshot>;
  eventsAt(cycle: number): Promise<readonly EventEnvelope[]>;
  entityHistory(
    entityId: string,
    from: number,
    to: number,
  ): Promise<readonly EventEnvelope[]>;
  close(): Promise<void>;
}
