import type {
  CheckpointState,
  ChunkIndexEntry,
  EventEnvelope,
  StringsTable,
  TraceIndex,
  TraceManifest,
} from "@linxsimcity/trace-schema";
import type { TopologyDescriptor } from "@linxsimcity/topology";

export interface NodeDirectorySource {
  readonly kind: "node-directory";
  readonly path: string;
}

export interface NodeFileSource {
  readonly kind: "node-file";
  readonly path: string;
}

export interface HttpDirectorySource {
  readonly kind: "http-directory";
  readonly baseUrl: string;
  readonly fetch?: typeof fetch | undefined;
}

export type TraceBundleSource =
  | File
  | FileSystemDirectoryHandle
  | NodeDirectorySource
  | NodeFileSource
  | HttpDirectorySource;

export interface TraceBundleReaderInterface {
  readManifest(): Promise<TraceManifest>;
  readTopology(): Promise<TopologyDescriptor>;
  readIndex(): Promise<TraceIndex>;
  readStrings(): Promise<StringsTable>;
  readChunk(chunk: ChunkIndexEntry): Promise<readonly EventEnvelope[]>;
  readCheckpoint(path: string): Promise<CheckpointState>;
  close(): Promise<void>;
}

export class TraceBundleError extends Error {
  constructor(
    readonly code:
      | "invalid_bundle"
      | "invalid_entry_path"
      | "missing_entry"
      | "resource_limit",
    message: string,
  ) {
    super(message);
    this.name = "TraceBundleError";
  }
}
