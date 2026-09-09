export const SIM_TRACE_SCHEMA = "linxsimcity.trace" as const;
export const SIM_TRACE_SCHEMA_VERSION = "1" as const;

export const SIM_TRACE_CAPABILITIES = [
  "queue-lifecycle",
  "tile-residency",
  "instruction-link",
  "compute-lifecycle",
] as const;

export type SimTraceCapability = (typeof SIM_TRACE_CAPABILITIES)[number];
export type DecimalU64 = string;
export type SimTracePhase = "work" | "xfer" | "commit" | "async";

export interface SimTraceManifest {
  readonly schema: typeof SIM_TRACE_SCHEMA;
  readonly schemaVersion: typeof SIM_TRACE_SCHEMA_VERSION;
  readonly runId: string;
  readonly topologyFingerprint: string;
  readonly simulator: {
    readonly name: string;
    readonly revision: string;
    readonly configSha256: string;
  };
  readonly workload: {
    readonly name: string;
    readonly sha256: string;
  };
  readonly timeDomains: readonly {
    readonly id: string;
    readonly unit: "cycle";
    readonly tickRatio: {
      readonly numerator: number;
      readonly denominator: number;
    };
  }[];
  readonly window: {
    readonly firstCycle: DecimalU64;
    readonly lastCycle: DecimalU64;
    readonly startsFromReset: boolean;
    readonly complete: boolean;
  };
  readonly eventCount: DecimalU64;
  readonly capabilities: readonly SimTraceCapability[];
  readonly loss: {
    readonly droppedEvents: DecimalU64;
    readonly truncated: boolean;
    readonly reason?: string | undefined;
  };
}

export const SIM_TRACE_EVENT_TYPES = [
  "queue.write-attempt",
  "queue.accept",
  "queue.visible",
  "queue.read",
  "queue.backpressure",
  "queue.cancel",
  "tile.allocate",
  "tile.read",
  "tile.write",
  "tile.move",
  "tile.release",
  "link.associate",
  "compute.start",
  "compute.complete",
  "run.reset",
  "run.flush",
] as const;

export type SimTraceEventType = (typeof SIM_TRACE_EVENT_TYPES)[number];

export interface SimTraceEvent<
  T extends SimTraceEventType = SimTraceEventType,
  P = unknown,
> {
  readonly timeDomain: string;
  readonly cycle: DecimalU64;
  readonly phase: SimTracePhase;
  readonly sequence: number;
  readonly type: T;
  readonly entityId: string;
  readonly payload: P;
}

export interface SimTraceDiagnostic {
  readonly code:
    | "manifest_mismatch"
    | "missing_capability"
    | "missing_entity"
    | "out_of_order"
    | "duplicate_order_key"
    | "cycle_out_of_window"
    | "queue_lifecycle"
    | "queue_capacity"
    | "tile_lifecycle"
    | "compute_lifecycle"
    | "event_count"
    | "loss_contract";
  readonly path: string;
  readonly message: string;
}

export interface SimTraceRun {
  readonly manifest: SimTraceManifest;
  readonly events: readonly SimTraceEvent[];
}
