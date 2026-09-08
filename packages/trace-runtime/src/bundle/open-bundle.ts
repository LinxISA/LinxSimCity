import {
  parseSimTraceCheckpoint,
  parseSimTraceEvent,
  parseSimTraceIndex,
  parseSimTraceManifest,
  type SimTraceCheckpoint,
  type SimTraceCheckpointIndexEntry,
  type SimTraceChunkIndexEntry,
  type SimTraceEvent,
  type SimTraceIndex,
  type SimTraceManifest,
} from "@linxsimcity/trace-schema";
import type { ArchitectureTopology } from "@linxsimcity/world";
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

export const MAX_METADATA_BYTES = 32 * 1024 * 1024;
export const MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024;
const MAX_CACHED_CHUNKS = 3;
const decoder = new TextDecoder("utf-8", { fatal: true });

function text(bytes: Uint8Array, path: string, limit: number): string {
  if (bytes.byteLength > limit)
    throw new TraceBundleError(
      "resource_limit",
      `${path} exceeds the ${limit}-byte limit`,
    );
  try {
    return decoder.decode(bytes);
  } catch {
    throw new TraceBundleError("invalid_bundle", `${path} is not valid UTF-8`);
  }
}

function json(source: string, path: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    throw new TraceBundleError("invalid_bundle", `${path} is not valid JSON`);
  }
}

function gzip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function decompress(bytes: Uint8Array, path: string): Uint8Array {
  try {
    const result = gzip(bytes) ? gunzipSync(bytes) : bytes;
    if (result.byteLength > MAX_DECOMPRESSED_BYTES)
      throw new TraceBundleError(
        "resource_limit",
        `${path} exceeds the decompressed byte limit`,
      );
    return result;
  } catch (error) {
    if (error instanceof TraceBundleError) throw error;
    throw new TraceBundleError(
      "invalid_bundle",
      `${path} is not valid gzip data`,
    );
  }
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
    .join(",")}}`;
}

function fingerprint(topology: ArchitectureTopology): string {
  const normalized = {
    schema: topology.schema,
    schemaVersion: topology.schemaVersion,
    id: topology.id,
    revision: topology.revision,
    nodes: [...topology.nodes]
      .map(({ id, definitionId, parentId, parameters, attributes, area }) => ({
        id,
        definitionId,
        ...(parentId ? { parentId } : {}),
        parameters,
        ...(attributes ? { attributes } : {}),
        area,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...topology.edges]
      .map(({ id, from, to }) => ({ id, from, to }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(stable(normalized))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function parseTopology(value: unknown): ArchitectureTopology {
  if (!value || typeof value !== "object")
    throw new TraceBundleError(
      "invalid_bundle",
      "topology.json must be an object",
    );
  const candidate = value as Partial<ArchitectureTopology>;
  if (
    candidate.schema !== "linxsimcity.topology" ||
    candidate.schemaVersion !== "1" ||
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.revision !== "string" ||
    !Array.isArray(candidate.nodes) ||
    !Array.isArray(candidate.edges)
  ) {
    throw new TraceBundleError(
      "invalid_bundle",
      "topology.json is not the current ArchitectureTopology format",
    );
  }
  return candidate as ArchitectureTopology;
}

async function hash(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(bytes),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyCompressed(
  bytes: Uint8Array,
  entry: {
    readonly path: string;
    readonly compressedBytes: number;
    readonly sha256: string;
  },
): Promise<void> {
  // HTTP Content-Encoding may already have been decoded by fetch, in which
  // case the indexed compressed representation is unavailable to JavaScript.
  if (!gzip(bytes)) return;
  if (bytes.byteLength !== entry.compressedBytes)
    throw new TraceBundleError(
      "integrity_mismatch",
      `${entry.path} compressed size does not match index value ${entry.compressedBytes}`,
    );
  const actual = await hash(bytes);
  if (actual !== entry.sha256)
    throw new TraceBundleError(
      "integrity_mismatch",
      `${entry.path} SHA-256 ${actual} does not match index value ${entry.sha256}`,
    );
}

function validateBinding(
  manifest: SimTraceManifest,
  topology: ArchitectureTopology,
  index: SimTraceIndex,
): void {
  if (
    index.runId !== manifest.runId ||
    index.topologyFingerprint !== manifest.topologyFingerprint ||
    manifest.topologyFingerprint !== fingerprint(topology)
  ) {
    throw new TraceBundleError(
      "invalid_bundle",
      "manifest, topology, and index bindings do not match",
    );
  }
  const domains = new Set(manifest.timeDomains.map(({ id }) => id));
  const checkpoints = new Map(index.checkpoints.map((item) => [item.id, item]));
  const previous = new Map<string, bigint>();
  let count = 0n;
  for (const chunk of index.chunks) {
    assertSafeEntryPath(chunk.path);
    const first = BigInt(chunk.firstCycle);
    const last = BigInt(chunk.lastCycle);
    if (
      !domains.has(chunk.timeDomain) ||
      first < BigInt(manifest.window.firstCycle) ||
      last > BigInt(manifest.window.lastCycle) ||
      (previous.get(chunk.timeDomain) ?? first) > first
    )
      throw new TraceBundleError(
        "invalid_bundle",
        `${chunk.path} has invalid or unordered cycle bounds`,
      );
    previous.set(chunk.timeDomain, last);
    const checkpoint = checkpoints.get(chunk.checkpointId);
    if (
      !checkpoint ||
      checkpoint.timeDomain !== chunk.timeDomain ||
      BigInt(checkpoint.cycle) > first
    )
      throw new TraceBundleError(
        "invalid_bundle",
        `${chunk.path} has an invalid checkpoint binding`,
      );
    count += BigInt(chunk.eventCount);
  }
  for (const checkpoint of index.checkpoints) {
    assertSafeEntryPath(checkpoint.path);
    if (
      !domains.has(checkpoint.timeDomain) ||
      BigInt(checkpoint.cycle) < BigInt(manifest.window.firstCycle) ||
      BigInt(checkpoint.cycle) > BigInt(manifest.window.lastCycle) ||
      BigInt(checkpoint.eventOrdinal) > BigInt(manifest.eventCount)
    )
      throw new TraceBundleError(
        "invalid_bundle",
        `${checkpoint.path} is outside the manifest window`,
      );
  }
  if (count !== BigInt(manifest.eventCount))
    throw new TraceBundleError(
      "invalid_bundle",
      "indexed event count does not match manifest eventCount",
    );
}

class BundleReader implements TraceBundleReaderInterface {
  private manifest?: SimTraceManifest;
  private topology?: ArchitectureTopology;
  private index?: SimTraceIndex;
  private closed = false;
  private readonly chunks = new Map<
    string,
    Promise<readonly SimTraceEvent[]>
  >();
  constructor(private readonly store: EntryStore) {}
  private check(signal?: AbortSignal): void {
    if (this.closed)
      throw new TraceBundleError(
        "invalid_bundle",
        "trace bundle reader is closed",
      );
    signal?.throwIfAborted();
  }
  private async document(path: string, signal?: AbortSignal): Promise<unknown> {
    this.check(signal);
    return json(
      text(await this.store.read(path, signal), path, MAX_METADATA_BYTES),
      path,
    );
  }
  async readManifest(signal?: AbortSignal): Promise<SimTraceManifest> {
    this.check(signal);
    return (this.manifest ??= parseSimTraceManifest(
      await this.document("manifest.json", signal),
    ));
  }
  async readTopology(signal?: AbortSignal): Promise<ArchitectureTopology> {
    this.check(signal);
    return (this.topology ??= parseTopology(
      await this.document("topology.json", signal),
    ));
  }
  async readIndex(signal?: AbortSignal): Promise<SimTraceIndex> {
    this.check(signal);
    return (this.index ??= parseSimTraceIndex(
      await this.document("index.json", signal),
    ));
  }

  async readChunk(
    chunk: SimTraceChunkIndexEntry,
    signal?: AbortSignal,
  ): Promise<readonly SimTraceEvent[]> {
    this.check(signal);
    assertSafeEntryPath(chunk.path);
    const indexed = (await this.readIndex(signal)).chunks.find(
      ({ id }) => id === chunk.id,
    );
    if (!indexed || stable(indexed) !== stable(chunk))
      throw new TraceBundleError(
        "invalid_bundle",
        `chunk ${chunk.id} is not bound to the loaded index`,
      );
    const cached = this.chunks.get(chunk.path);
    if (cached) {
      this.chunks.delete(chunk.path);
      this.chunks.set(chunk.path, cached);
      return cached;
    }
    const pending = this.loadChunk(indexed, signal).catch((error: unknown) => {
      this.chunks.delete(chunk.path);
      throw error;
    });
    this.chunks.set(chunk.path, pending);
    while (this.chunks.size > MAX_CACHED_CHUNKS) {
      const oldest = this.chunks.keys().next().value as string | undefined;
      if (!oldest) break;
      this.chunks.delete(oldest);
    }
    return pending;
  }

  private async loadChunk(
    chunk: SimTraceChunkIndexEntry,
    signal?: AbortSignal,
  ): Promise<readonly SimTraceEvent[]> {
    const bytes = await this.store.read(chunk.path, signal);
    await verifyCompressed(bytes, chunk);
    signal?.throwIfAborted();
    const events = text(
      decompress(bytes, chunk.path),
      chunk.path,
      MAX_DECOMPRESSED_BYTES,
    )
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line, lineIndex) => {
        try {
          return parseSimTraceEvent(JSON.parse(line) as unknown);
        } catch {
          throw new TraceBundleError(
            "invalid_bundle",
            `${chunk.path} contains an invalid event at line ${lineIndex + 1}`,
          );
        }
      });
    if (BigInt(events.length) !== BigInt(chunk.eventCount))
      throw new TraceBundleError(
        "invalid_bundle",
        `${chunk.path} event count does not match index value ${chunk.eventCount}`,
      );
    const first = events[0];
    const last = events.at(-1);
    if (
      !first ||
      !last ||
      first.cycle !== chunk.firstCycle ||
      last.cycle !== chunk.lastCycle ||
      events.some(
        (event) =>
          event.timeDomain !== chunk.timeDomain ||
          BigInt(event.cycle) < BigInt(chunk.firstCycle) ||
          BigInt(event.cycle) > BigInt(chunk.lastCycle),
      )
    )
      throw new TraceBundleError(
        "invalid_bundle",
        `${chunk.path} contents do not match indexed domain and cycle bounds`,
      );
    return events;
  }

  async readCheckpoint(
    entry: SimTraceCheckpointIndexEntry,
    signal?: AbortSignal,
  ): Promise<SimTraceCheckpoint> {
    this.check(signal);
    assertSafeEntryPath(entry.path);
    const [index, manifest] = await Promise.all([
      this.readIndex(signal),
      this.readManifest(signal),
    ]);
    const indexed = index.checkpoints.find(({ id }) => id === entry.id);
    if (!indexed || stable(indexed) !== stable(entry))
      throw new TraceBundleError(
        "invalid_bundle",
        `checkpoint ${entry.id} is not bound to the loaded index`,
      );
    const bytes = await this.store.read(indexed.path, signal);
    await verifyCompressed(bytes, indexed);
    signal?.throwIfAborted();
    const value = parseSimTraceCheckpoint(
      json(
        text(
          decompress(bytes, indexed.path),
          indexed.path,
          MAX_DECOMPRESSED_BYTES,
        ),
        indexed.path,
      ),
    );
    for (const [field, actual, expected] of [
      ["runId", value.runId, manifest.runId],
      [
        "topologyFingerprint",
        value.topologyFingerprint,
        manifest.topologyFingerprint,
      ],
      ["timeDomain", value.timeDomain, indexed.timeDomain],
      ["cycle", value.cycle, indexed.cycle],
      ["eventOrdinal", value.eventOrdinal, indexed.eventOrdinal],
    ] as const) {
      if (actual !== expected)
        throw new TraceBundleError(
          "invalid_bundle",
          `${indexed.path}.${field} ${actual} does not match ${expected}`,
        );
    }
    return value;
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.chunks.clear();
    await this.store.close();
  }
}

async function openTraceBundle(
  source: TraceBundleSource,
): Promise<TraceBundleReaderInterface> {
  const store = await openEntryStore(source);
  const reader = new BundleReader(store);
  try {
    const [manifest, topology, index] = await Promise.all([
      reader.readManifest(),
      reader.readTopology(),
      reader.readIndex(),
    ]);
    validateBinding(manifest, topology, index);
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
