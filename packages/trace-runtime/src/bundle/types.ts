import type {
  SimTraceCheckpoint,
  SimTraceCheckpointIndexEntry,
  SimTraceChunkIndexEntry,
  SimTraceEvent,
  SimTraceIndex,
  SimTraceManifest,
} from "@linxsimcity/trace-schema";
import type { ArchitectureTopology } from "@linxsimcity/topology";

export interface NodeDirectorySource {
  readonly kind: "node-directory";
  readonly path: string;
}

export interface HttpDirectorySource {
  readonly kind: "http-directory";
  readonly baseUrl: string;
  readonly fetch?: typeof fetch | undefined;
}

export type TraceBundleSource = NodeDirectorySource | HttpDirectorySource;

export interface TraceBundleReaderInterface {
  readManifest(signal?: AbortSignal): Promise<SimTraceManifest>;
  readTopology(signal?: AbortSignal): Promise<ArchitectureTopology>;
  readIndex(signal?: AbortSignal): Promise<SimTraceIndex>;
  readChunk(
    chunk: SimTraceChunkIndexEntry,
    signal?: AbortSignal,
  ): Promise<readonly SimTraceEvent[]>;
  readCheckpoint(
    checkpoint: SimTraceCheckpointIndexEntry,
    signal?: AbortSignal,
  ): Promise<SimTraceCheckpoint>;
  close(): Promise<void>;
}

export class TraceBundleError extends Error {
  constructor(
    readonly code:
      | "invalid_bundle"
      | "invalid_entry_path"
      | "missing_entry"
      | "resource_limit"
      | "integrity_mismatch"
      | "unsupported_source",
    message: string,
  ) {
    super(message);
    this.name = "TraceBundleError";
  }
}
