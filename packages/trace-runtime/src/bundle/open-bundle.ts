import {
  parseCheckpoint,
  parseEvent,
  parseIndex,
  parseManifest,
  parseStrings,
  type CheckpointState,
  type ChunkIndexEntry,
  type EventEnvelope,
  type StringsTable,
  type TraceIndex,
  type TraceManifest,
} from "@linxsimcity/trace-schema";
import {
  validateTopology,
  type TopologyDescriptor,
} from "@linxsimcity/topology";
import { gunzipSync } from "fflate";

import {
  assertSafeEntryPath,
  openEntryStore,
  type EntryStore,
} from "./entry-store.js";
import {
  TraceBundleError,
  type TraceBundleReaderInterface,
  type TraceBundleSource,
} from "./types.js";

const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024;
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function decodeText(
  bytes: Uint8Array,
  path: string,
  limit = MAX_METADATA_BYTES,
): string {
  if (bytes.byteLength > limit) {
    throw new TraceBundleError(
      "resource_limit",
      `${path} exceeds the ${limit}-byte limit`,
    );
  }
  try {
    return textDecoder.decode(bytes);
  } catch {
    throw new TraceBundleError("invalid_bundle", `${path} is not valid UTF-8`);
  }
}

function parseJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new TraceBundleError("invalid_bundle", `${path} is not valid JSON`);
  }
}

function decompress(bytes: Uint8Array, path: string): Uint8Array {
  try {
    const result = gunzipSync(bytes);
    if (result.byteLength > MAX_DECOMPRESSED_BYTES) {
      throw new TraceBundleError(
        "resource_limit",
        `${path} exceeds the ${MAX_DECOMPRESSED_BYTES}-byte decompressed limit`,
      );
    }
    return result;
  } catch (error) {
    if (error instanceof TraceBundleError) throw error;
    throw new TraceBundleError(
      "invalid_bundle",
      `${path} is not valid gzip data`,
    );
  }
}

function parseTopology(value: unknown): TopologyDescriptor {
  if (
    typeof value !== "object" ||
    value === null ||
    !("schemaVersion" in value) ||
    typeof value.schemaVersion !== "string" ||
    !("entities" in value) ||
    !Array.isArray(value.entities)
  ) {
    throw new TraceBundleError(
      "invalid_bundle",
      "topology.json has an invalid shape",
    );
  }
  const topology = value as TopologyDescriptor;
  const validation = validateTopology(topology);
  if (validation.errors.length > 0) {
    throw new TraceBundleError(
      "invalid_bundle",
      `topology.json is invalid: ${validation.errors[0]!.message}`,
    );
  }
  return topology;
}

class BundleReader implements TraceBundleReaderInterface {
  private manifest?: TraceManifest;
  private topology?: TopologyDescriptor;
  private index?: TraceIndex;
  private strings?: StringsTable;
  private readonly chunkCache = new Map<string, readonly EventEnvelope[]>();

  constructor(private readonly store: EntryStore) {}

  private async json(path: string): Promise<unknown> {
    return parseJson(decodeText(await this.store.read(path), path), path);
  }

  async readManifest(): Promise<TraceManifest> {
    return (this.manifest ??= parseManifest(await this.json("manifest.json")));
  }

  async readTopology(): Promise<TopologyDescriptor> {
    return (this.topology ??= parseTopology(await this.json("topology.json")));
  }

  async readIndex(): Promise<TraceIndex> {
    return (this.index ??= parseIndex(await this.json("index.json")));
  }

  async readStrings(): Promise<StringsTable> {
    return (this.strings ??= parseStrings(await this.json("strings.json")));
  }

  async readChunk(chunk: ChunkIndexEntry): Promise<readonly EventEnvelope[]> {
    assertSafeEntryPath(chunk.path);
    const cached = this.chunkCache.get(chunk.path);
    if (cached) {
      this.chunkCache.delete(chunk.path);
      this.chunkCache.set(chunk.path, cached);
      return cached;
    }

    const text = decodeText(
      decompress(await this.store.read(chunk.path), chunk.path),
      chunk.path,
      MAX_DECOMPRESSED_BYTES,
    );
    const events = text
      .split(/\r?\n/u)
      .filter((line) => line.length > 0)
      .map((line, index) => {
        try {
          return parseEvent(JSON.parse(line));
        } catch {
          throw new TraceBundleError(
            "invalid_bundle",
            `${chunk.path} contains an invalid event at line ${index + 1}`,
          );
        }
      });
    if (events.length !== chunk.eventCount) {
      throw new TraceBundleError(
        "invalid_bundle",
        `${chunk.path} declares ${chunk.eventCount} events but contains ${events.length}`,
      );
    }
    this.chunkCache.set(chunk.path, events);
    while (this.chunkCache.size > 3) {
      const oldest = this.chunkCache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.chunkCache.delete(oldest);
    }
    return events;
  }

  async readCheckpoint(path: string): Promise<CheckpointState> {
    assertSafeEntryPath(path);
    const text = decodeText(
      decompress(await this.store.read(path), path),
      path,
      MAX_DECOMPRESSED_BYTES,
    );
    return parseCheckpoint(parseJson(text, path));
  }

  async close(): Promise<void> {
    this.chunkCache.clear();
    await this.store.close();
  }
}

async function openTraceBundle(
  source: TraceBundleSource,
): Promise<TraceBundleReaderInterface> {
  const store = await openEntryStore(source);
  const reader = new BundleReader(store);
  try {
    await Promise.all([
      reader.readManifest(),
      reader.readIndex(),
      reader.readTopology(),
    ]);
    return reader;
  } catch (error) {
    await reader.close();
    if (error instanceof TraceBundleError) throw error;
    throw new TraceBundleError(
      "invalid_bundle",
      `trace bundle is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export const TraceBundleReader = { open: openTraceBundle } as const;
