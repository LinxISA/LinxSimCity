import { createHash } from "node:crypto";

import {
  parseCheckpoint,
  parseEvent,
  parseIndex,
  parseManifest,
  parseStrings,
  type CheckpointState,
  type EventEnvelope,
  type TraceIndex,
  type TraceManifest,
} from "@linxsimcity/trace-schema";
import {
  createEventReferenceIndex,
  validateEventReferences,
  validateTopology,
  type EventReferenceIndex,
  type TopologyDescriptor,
} from "@linxsimcity/topology";
import { Gunzip } from "fflate";
import { z } from "zod";

import {
  openBundle,
  readEntryLimited,
  ResourceLimitError,
  type BundleSource,
} from "./io.js";
import { ResourceBudget, type ResourceLimitOverrides } from "./limits.js";

const REQUIRED_FILES = [
  "manifest.json",
  "topology.json",
  "strings.json",
  "index.json",
] as const;
const MAX_COMPRESSED_CHUNK_BYTES = 256 * 1024 * 1024;
const MAX_UNCOMPRESSED_CHUNK_BYTES = 1024 * 1024 * 1024;

export interface ValidationOptions {
  limits?: ResourceLimitOverrides;
}

const TopologyVector3Schema = z.tuple([z.number(), z.number(), z.number()]);

const TopologySchema = z.strictObject({
  schemaVersion: z.string().min(1),
  layout: z
    .strictObject({
      schema: z.literal("linx-city-v1"),
      units: z.literal("scene-unit"),
      upAxis: z.literal("y"),
      forwardAxis: z.literal("-z"),
      districts: z.array(
        z.strictObject({
          id: z.string().min(1),
          position: TopologyVector3Schema,
          size: TopologyVector3Schema,
        }),
      ),
    })
    .optional(),
  entities: z.array(
    z.strictObject({
      id: z.string().min(1),
      kind: z.enum([
        "module",
        "cache-line",
        "rob-slot",
        "queue-slot",
        "register",
        "cell",
        "xbar-lane",
        "cube-mac",
        "stgbufb-subspace",
        "pipe",
      ]),
      parentId: z.string().min(1).optional(),
      label: z.string().min(1),
      instance: z.record(z.string(), z.union([z.number(), z.string()])),
      capacity: z.number().optional(),
      ports: z
        .array(
          z.strictObject({
            id: z.string().min(1),
            direction: z.enum(["in", "out", "inout"]),
            widthBytes: z.number().optional(),
            position: TopologyVector3Schema.optional(),
          }),
        )
        .optional(),
      placement: z
        .strictObject({
          district: z.string().min(1),
          thread: z.number().optional(),
          position: TopologyVector3Schema.optional(),
          size: TopologyVector3Schema.optional(),
          rotation: TopologyVector3Schema.optional(),
          order: z.number().optional(),
          row: z.number().optional(),
          column: z.number().optional(),
          lodGroup: z.string().min(1).optional(),
        })
        .optional(),
      route: z
        .strictObject({
          style: z.literal("orthogonal"),
          fromPortId: z.string().min(1),
          toPortId: z.string().min(1),
          points: z.array(TopologyVector3Schema).min(2),
        })
        .optional(),
      attributes: z
        .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
        .optional(),
    }),
  ),
});

export interface ValidationDiagnostic {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface ValidationStats {
  schemaVersion?: string;
  profile?: string;
  firstCycle?: number;
  lastCycle?: number;
  cycles: number;
  events: number;
  chunks: number;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationDiagnostic[];
  warnings: ValidationDiagnostic[];
  stats: ValidationStats;
}

function diagnostic(
  code: string,
  path: string,
  message: string,
): ValidationDiagnostic {
  return { severity: "error", code, path, message };
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error(
      `${path}: ${error instanceof Error ? error.message : "invalid JSON"}`,
      { cause: error },
    );
  }
}

function zodDiagnostic(path: string, error: z.ZodError): ValidationDiagnostic {
  const issue = error.issues[0];
  const suffix = issue?.path.length ? `.${issue.path.join(".")}` : "";
  return diagnostic(
    "schema_validation",
    `${path}${suffix}`,
    issue?.message ?? "schema validation failed",
  );
}

function errorDiagnostic(path: string, error: unknown): ValidationDiagnostic {
  return diagnostic(
    error instanceof ResourceLimitError
      ? "resource_limit"
      : "schema_validation",
    path,
    error instanceof Error ? error.message : "validation failed",
  );
}

async function parseRequired<T>(
  bundle: BundleSource,
  path: string,
  parser: (value: unknown) => T,
  budget: ResourceBudget,
  errors: ValidationDiagnostic[],
): Promise<T | undefined> {
  try {
    return parser(
      parseJson(
        await readEntryLimited(
          bundle,
          path,
          budget.limits.metadataEntryBytes,
          (chunk) => budget.consumeMetadata(chunk.byteLength, path),
        ),
        path,
      ),
    );
  } catch (error) {
    errors.push(
      error instanceof z.ZodError
        ? zodDiagnostic(path, error)
        : errorDiagnostic(path, error),
    );
    return undefined;
  }
}

function checkpointPathFor(cycle: number, span: number): string {
  return `checkpoints/${Math.floor(cycle / span)
    .toString()
    .padStart(6, "0")}.json.gz`;
}

function validateCheckpoint(
  checkpoint: CheckpointState,
  path: string,
  firstEvent: EventEnvelope | undefined,
  manifest: TraceManifest,
  errors: ValidationDiagnostic[],
): void {
  const expectedCycle =
    Math.floor((firstEvent?.cycle ?? 0) / manifest.checkpointCycleSpan) *
    manifest.checkpointCycleSpan;
  if (
    checkpoint.cycle !== expectedCycle ||
    checkpoint.seq !== 0 ||
    (firstEvent !== undefined && checkpoint.cycle > firstEvent.cycle)
  ) {
    errors.push(
      diagnostic(
        "checkpoint_bounds_mismatch",
        path,
        `checkpoint must be (${expectedCycle}, 0) and must not be later than its first event`,
      ),
    );
  }
}

interface ChunkResult {
  first?: EventEnvelope;
  last?: EventEnvelope;
  eventCount: number;
  compressedBytes: number;
  sha256: string;
}

async function validateChunk(
  bundle: BundleSource,
  path: string,
  eventReferences: EventReferenceIndex,
  previous: EventEnvelope | undefined,
  globalEventOffset: number,
  budget: ResourceBudget,
  errors: ValidationDiagnostic[],
): Promise<ChunkResult> {
  const hash = createHash("sha256");
  const decoder = new TextDecoder();
  let compressedBytes = 0;
  let uncompressedBytes = 0;
  let buffer = "";
  let eventCount = 0;
  let first: EventEnvelope | undefined;
  let last = previous;

  const parseLine = (line: string): void => {
    if (line.length === 0) return;
    budget.consumeEvent(path);
    let event: EventEnvelope;
    try {
      event = parseEvent(JSON.parse(line));
    } catch (error) {
      errors.push(
        error instanceof z.ZodError
          ? zodDiagnostic(`${path}:${eventCount + 1}`, error)
          : errorDiagnostic(`${path}:${eventCount + 1}`, error),
      );
      return;
    }
    if (
      last &&
      (event.cycle < last.cycle ||
        (event.cycle === last.cycle && event.seq <= last.seq))
    ) {
      errors.push(
        diagnostic(
          "event_order",
          `events[${globalEventOffset + eventCount}]`,
          `(cycle, seq) (${event.cycle}, ${event.seq}) is not strictly greater than (${last.cycle}, ${last.seq})`,
        ),
      );
    }
    const references = validateEventReferences(eventReferences, [event]);
    for (const reference of references.errors) {
      errors.push({
        ...reference,
        path: `events[${globalEventOffset + eventCount}].entity_id`,
      });
    }
    first ??= event;
    last = event;
    eventCount++;
  };

  let gunzipError: unknown;
  const gunzip = new Gunzip((data, final) => {
    try {
      uncompressedBytes += data.byteLength;
      if (uncompressedBytes > MAX_UNCOMPRESSED_CHUNK_BYTES) {
        throw new ResourceLimitError(
          `${path} exceeds the ${MAX_UNCOMPRESSED_CHUNK_BYTES}-byte uncompressed resource limit`,
        );
      }
      budget.consumeUncompressed(data.byteLength, path);
      buffer += decoder.decode(data, { stream: !final });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) parseLine(line);
      if (final && buffer.length > 0) {
        parseLine(buffer);
        buffer = "";
      }
    } catch (error) {
      gunzipError = error;
      throw error;
    }
  });

  try {
    await bundle.readChunks(path, (chunk) => {
      compressedBytes += chunk.byteLength;
      if (compressedBytes > MAX_COMPRESSED_CHUNK_BYTES) {
        throw new ResourceLimitError(
          `${path} exceeds the ${MAX_COMPRESSED_CHUNK_BYTES}-byte compressed resource limit`,
        );
      }
      budget.consumeCompressed(chunk.byteLength, path);
      hash.update(chunk);
      gunzip.push(chunk, false);
    });
    gunzip.push(new Uint8Array(), true);
  } catch (error) {
    throw gunzipError ?? error;
  }

  return {
    ...(first === undefined ? {} : { first }),
    ...(last === undefined || last === previous ? {} : { last }),
    eventCount,
    compressedBytes,
    sha256: hash.digest("hex"),
  };
}

async function readCheckpoint(
  bundle: BundleSource,
  path: string,
  budget: ResourceBudget,
): Promise<CheckpointState> {
  const compressed = await readEntryLimited(
    bundle,
    path,
    budget.limits.metadataEntryBytes,
    (chunk) => budget.consumeCompressed(chunk.byteLength, path),
  );
  const chunks: Uint8Array[] = [];
  let total = 0;
  const gunzip = new Gunzip((data) => {
    total += data.byteLength;
    if (total > budget.limits.metadataEntryBytes) {
      throw new ResourceLimitError(
        `${path} exceeds the ${budget.limits.metadataEntryBytes}-byte uncompressed resource limit`,
      );
    }
    budget.consumeUncompressed(data.byteLength, path);
    chunks.push(data);
  });
  gunzip.push(compressed, true);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return parseCheckpoint(parseJson(output, path));
}

async function validateChunks(
  bundle: BundleSource,
  index: TraceIndex,
  manifest: TraceManifest,
  topology: TopologyDescriptor,
  budget: ResourceBudget,
  errors: ValidationDiagnostic[],
): Promise<{
  eventCount: number;
  first?: EventEnvelope;
  last?: EventEnvelope;
}> {
  const eventReferences = createEventReferenceIndex(topology);
  let eventCount = 0;
  let first: EventEnvelope | undefined;
  let last: EventEnvelope | undefined;
  const seenPaths = new Set<string>();
  type CheckpointResult =
    | { status: "valid"; checkpoint: CheckpointState }
    | { status: "invalid"; diagnostic: ValidationDiagnostic };
  const checkpoints = new Map<string, CheckpointResult>();

  for (const [chunkNumber, chunk] of index.chunks.entries()) {
    const chunkPath = `index.json.chunks[${chunkNumber}]`;
    if (chunk.compressedBytes > MAX_COMPRESSED_CHUNK_BYTES) {
      errors.push(
        diagnostic(
          "resource_limit",
          `${chunkPath}.compressedBytes`,
          `declared size exceeds ${MAX_COMPRESSED_CHUNK_BYTES} bytes`,
        ),
      );
      continue;
    }
    if (seenPaths.has(chunk.path)) {
      errors.push(
        diagnostic("duplicate_chunk_path", `${chunkPath}.path`, chunk.path),
      );
      continue;
    }
    seenPaths.add(chunk.path);
    if (!bundle.has(chunk.path)) {
      errors.push(
        diagnostic(
          "missing_required_file",
          chunk.path,
          `indexed chunk is missing: ${chunk.path}`,
        ),
      );
      continue;
    }

    let result: ChunkResult;
    try {
      result = await validateChunk(
        bundle,
        chunk.path,
        eventReferences,
        last,
        eventCount,
        budget,
        errors,
      );
    } catch (error) {
      errors.push(
        diagnostic(
          error instanceof ResourceLimitError
            ? "resource_limit"
            : "chunk_decompression",
          chunk.path,
          error instanceof Error ? error.message : "chunk validation failed",
        ),
      );
      if (error instanceof ResourceLimitError) break;
      continue;
    }

    first ??= result.first;
    last = result.last ?? last;
    eventCount += result.eventCount;
    if (result.sha256 !== chunk.sha256) {
      errors.push(
        diagnostic(
          "chunk_hash_mismatch",
          `${chunkPath}.sha256`,
          `expected ${chunk.sha256}, received ${result.sha256}`,
        ),
      );
    }
    if (result.compressedBytes !== chunk.compressedBytes) {
      errors.push(
        diagnostic(
          "chunk_size_mismatch",
          `${chunkPath}.compressedBytes`,
          `expected ${chunk.compressedBytes}, received ${result.compressedBytes}`,
        ),
      );
    }
    if (
      result.eventCount !== chunk.eventCount ||
      result.first?.cycle !== chunk.firstCycle ||
      result.last?.cycle !== chunk.lastCycle
    ) {
      errors.push(
        diagnostic(
          "index_bounds_mismatch",
          chunkPath,
          "chunk event count or cycle bounds do not match index metadata",
        ),
      );
    }
    if (
      result.first &&
      Math.floor(result.first.cycle / manifest.chunkCycleSpan) !==
        Math.floor(
          (result.last?.cycle ?? result.first.cycle) / manifest.chunkCycleSpan,
        )
    ) {
      errors.push(
        diagnostic(
          "chunk_bucket_mismatch",
          chunkPath,
          `chunk events cross a ${manifest.chunkCycleSpan}-cycle bucket`,
        ),
      );
    }
    if (result.first) {
      const expectedChunkPath = `chunks/${Math.floor(
        result.first.cycle / manifest.chunkCycleSpan,
      )
        .toString()
        .padStart(6, "0")}.jsonl.gz`;
      if (chunk.path !== expectedChunkPath) {
        errors.push(
          diagnostic(
            "chunk_bucket_mismatch",
            `${chunkPath}.path`,
            `expected ${expectedChunkPath}, received ${chunk.path}`,
          ),
        );
      }
    }
    if (
      result.first &&
      (result.first.cycle < manifest.firstCycle ||
        (result.last?.cycle ?? result.first.cycle) > manifest.lastCycle)
    ) {
      errors.push(
        diagnostic(
          "index_bounds_mismatch",
          chunkPath,
          "chunk cycle bounds are outside manifest bounds",
        ),
      );
    }

    const expectedCheckpointPath = checkpointPathFor(
      result.first?.cycle ?? chunk.firstCycle,
      manifest.checkpointCycleSpan,
    );
    if (chunk.checkpointPath !== expectedCheckpointPath) {
      errors.push(
        diagnostic(
          "checkpoint_path_mismatch",
          `${chunkPath}.checkpointPath`,
          `expected ${expectedCheckpointPath}, received ${chunk.checkpointPath}`,
        ),
      );
    }
    if (!bundle.has(chunk.checkpointPath)) {
      errors.push(
        diagnostic(
          "missing_required_file",
          chunk.checkpointPath,
          `indexed checkpoint is missing: ${chunk.checkpointPath}`,
        ),
      );
    } else {
      try {
        let checkpointResult = checkpoints.get(chunk.checkpointPath);
        if (!checkpointResult) {
          try {
            checkpointResult = {
              status: "valid",
              checkpoint: await readCheckpoint(
                bundle,
                chunk.checkpointPath,
                budget,
              ),
            };
          } catch (error) {
            if (error instanceof ResourceLimitError) throw error;
            checkpointResult = {
              status: "invalid",
              diagnostic: errorDiagnostic(chunk.checkpointPath, error),
            };
          }
          checkpoints.set(chunk.checkpointPath, checkpointResult);
          if (checkpointResult.status === "invalid") {
            errors.push(checkpointResult.diagnostic);
          }
        }
        if (checkpointResult.status === "valid") {
          validateCheckpoint(
            checkpointResult.checkpoint,
            chunk.checkpointPath,
            result.first,
            manifest,
            errors,
          );
        }
      } catch (error) {
        errors.push(errorDiagnostic(chunk.checkpointPath, error));
        if (error instanceof ResourceLimitError) break;
      }
    }
  }

  return {
    eventCount,
    ...(first === undefined ? {} : { first }),
    ...(last === undefined ? {} : { last }),
  };
}

export async function validateBundle(
  path: string,
  options: ValidationOptions = {},
): Promise<ValidationReport> {
  const errors: ValidationDiagnostic[] = [];
  const warnings: ValidationDiagnostic[] = [];
  const stats: ValidationStats = { cycles: 0, events: 0, chunks: 0 };
  let bundle: BundleSource | undefined;
  const budget = new ResourceBudget(options.limits);

  try {
    bundle = await openBundle(path);
    for (const required of REQUIRED_FILES) {
      if (!bundle.has(required)) {
        errors.push(
          diagnostic(
            "missing_required_file",
            required,
            `required bundle file is missing: ${required}`,
          ),
        );
      }
    }
    if (errors.length > 0) return { valid: false, errors, warnings, stats };

    const [manifest, topology, index] = await Promise.all([
      parseRequired(bundle, "manifest.json", parseManifest, budget, errors),
      parseRequired(
        bundle,
        "topology.json",
        (value) => TopologySchema.parse(value) as TopologyDescriptor,
        budget,
        errors,
      ),
      parseRequired(bundle, "index.json", parseIndex, budget, errors),
      parseRequired(bundle, "strings.json", parseStrings, budget, errors),
    ]);
    if (!manifest || !topology || !index) {
      return { valid: false, errors, warnings, stats };
    }

    Object.assign(stats, {
      schemaVersion: manifest.schemaVersion,
      profile: manifest.profile,
      firstCycle: manifest.firstCycle,
      lastCycle: manifest.lastCycle,
      cycles: manifest.lastCycle - manifest.firstCycle + 1,
      events: manifest.eventCount,
      chunks: manifest.chunkCount,
    });
    try {
      budget.assertChunks(manifest.chunkCount, "manifest.json.chunkCount");
      budget.assertChunks(index.chunks.length, "index.json.chunks");
      if (manifest.eventCount > budget.limits.events) {
        throw new ResourceLimitError(
          `manifest.json.eventCount exceeds the ${budget.limits.events} limit`,
        );
      }
    } catch (error) {
      errors.push(errorDiagnostic("manifest.json", error));
      return { valid: false, errors, warnings, stats };
    }

    const topologyResult = validateTopology(topology);
    errors.push(...topologyResult.errors);
    warnings.push(...topologyResult.warnings);
    for (const [file, version] of [
      ["index.json", index.schemaVersion],
      ["topology.json", topology.schemaVersion],
    ] as const) {
      if (version !== manifest.schemaVersion) {
        errors.push(
          diagnostic(
            "schema_version_mismatch",
            `${file}.schemaVersion`,
            `${file} schema ${version} does not match manifest schema ${manifest.schemaVersion}`,
          ),
        );
      }
    }

    const events = await validateChunks(
      bundle,
      index,
      manifest,
      topology,
      budget,
      errors,
    );
    if (
      manifest.chunkCount !== index.chunks.length ||
      manifest.eventCount !== events.eventCount ||
      (events.first !== undefined &&
        (events.first.cycle !== manifest.firstCycle ||
          events.last?.cycle !== manifest.lastCycle))
    ) {
      errors.push(
        diagnostic(
          "index_bounds_mismatch",
          "manifest.json",
          "manifest counts or cycle bounds do not match indexed events",
        ),
      );
    }
    return { valid: errors.length === 0, errors, warnings, stats };
  } catch (error) {
    errors.push(
      diagnostic(
        error instanceof ResourceLimitError ? "resource_limit" : "bundle_io",
        path,
        error instanceof Error ? error.message : "could not read bundle",
      ),
    );
    return { valid: false, errors, warnings, stats };
  } finally {
    await bundle?.close();
  }
}
