import { createHash } from "node:crypto";

import {
  parseCheckpoint,
  parseEvent,
  parseIndex,
  parseManifest,
  type EventEnvelope,
  type TraceIndex,
  type TraceManifest,
} from "@linxsimcity/trace-schema";
import {
  validateEventReferences,
  validateTopology,
  type TopologyDescriptor,
} from "@linxsimcity/topology";
import { gunzipSync } from "fflate";
import { z } from "zod";

import { openBundle, type BundleSource } from "./io.js";

const REQUIRED_FILES = [
  "manifest.json",
  "topology.json",
  "strings.json",
  "index.json",
] as const;

const TopologySchema = z.strictObject({
  schemaVersion: z.string().min(1),
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
          }),
        )
        .optional(),
      placement: z
        .strictObject({
          district: z.string().min(1),
          order: z.number().optional(),
          row: z.number().optional(),
          column: z.number().optional(),
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

async function parseRequired<T>(
  bundle: BundleSource,
  path: string,
  parser: (value: unknown) => T,
  errors: ValidationDiagnostic[],
): Promise<T | undefined> {
  try {
    return parser(parseJson(await bundle.read(path), path));
  } catch (error) {
    errors.push(
      error instanceof z.ZodError
        ? zodDiagnostic(path, error)
        : diagnostic(
            "schema_validation",
            path,
            error instanceof Error ? error.message : "validation failed",
          ),
    );
    return undefined;
  }
}

function checkOrder(
  events: readonly EventEnvelope[],
  previous: EventEnvelope | undefined,
  startIndex: number,
  errors: ValidationDiagnostic[],
): EventEnvelope | undefined {
  let last = previous;
  events.forEach((event, index) => {
    if (
      last &&
      (event.cycle < last.cycle ||
        (event.cycle === last.cycle && event.seq <= last.seq))
    ) {
      errors.push(
        diagnostic(
          "event_order",
          `events[${startIndex + index}]`,
          `(cycle, seq) (${event.cycle}, ${event.seq}) is not strictly greater than (${last.cycle}, ${last.seq})`,
        ),
      );
    }
    last = event;
  });
  return last;
}

async function readChunkEvents(
  bundle: BundleSource,
  index: TraceIndex,
  manifest: TraceManifest,
  errors: ValidationDiagnostic[],
): Promise<EventEnvelope[]> {
  const allEvents: EventEnvelope[] = [];
  let previous: EventEnvelope | undefined;
  const seenPaths = new Set<string>();

  for (const [chunkNumber, chunk] of index.chunks.entries()) {
    const chunkPath = `index.json.chunks[${chunkNumber}]`;
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

    let compressed: Uint8Array;
    let lines: string[];
    try {
      compressed = await bundle.read(chunk.path);
      lines = new TextDecoder()
        .decode(gunzipSync(compressed))
        .split(/\r?\n/)
        .filter((line) => line.length > 0);
    } catch (error) {
      errors.push(
        diagnostic(
          "chunk_decompression",
          chunk.path,
          error instanceof Error ? error.message : "gzip decompression failed",
        ),
      );
      continue;
    }

    const digest = createHash("sha256").update(compressed).digest("hex");
    if (digest !== chunk.sha256) {
      errors.push(
        diagnostic(
          "chunk_hash_mismatch",
          `${chunkPath}.sha256`,
          `expected ${chunk.sha256}, received ${digest}`,
        ),
      );
    }
    if (compressed.byteLength !== chunk.compressedBytes) {
      errors.push(
        diagnostic(
          "chunk_size_mismatch",
          `${chunkPath}.compressedBytes`,
          `expected ${chunk.compressedBytes}, received ${compressed.byteLength}`,
        ),
      );
    }

    const events: EventEnvelope[] = [];
    lines.forEach((line, lineNumber) => {
      try {
        events.push(parseEvent(JSON.parse(line)));
      } catch (error) {
        errors.push(
          error instanceof z.ZodError
            ? zodDiagnostic(`${chunk.path}:${lineNumber + 1}`, error)
            : diagnostic(
                "schema_validation",
                `${chunk.path}:${lineNumber + 1}`,
                error instanceof Error ? error.message : "invalid event JSON",
              ),
        );
      }
    });

    previous = checkOrder(events, previous, allEvents.length, errors);
    allEvents.push(...events);

    const first = events[0];
    const last = events.at(-1);
    if (
      events.length !== chunk.eventCount ||
      first?.cycle !== chunk.firstCycle ||
      last?.cycle !== chunk.lastCycle
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
      first &&
      (first.cycle < manifest.firstCycle ||
        (last?.cycle ?? first.cycle) > manifest.lastCycle)
    ) {
      errors.push(
        diagnostic(
          "index_bounds_mismatch",
          chunkPath,
          "chunk cycle bounds are outside manifest bounds",
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
        parseCheckpoint(
          parseJson(
            gunzipSync(await bundle.read(chunk.checkpointPath)),
            chunk.checkpointPath,
          ),
        );
      } catch (error) {
        errors.push(
          error instanceof z.ZodError
            ? zodDiagnostic(chunk.checkpointPath, error)
            : diagnostic(
                "checkpoint_validation",
                chunk.checkpointPath,
                error instanceof Error ? error.message : "invalid checkpoint",
              ),
        );
      }
    }
  }

  return allEvents;
}

export async function validateBundle(path: string): Promise<ValidationReport> {
  const errors: ValidationDiagnostic[] = [];
  const warnings: ValidationDiagnostic[] = [];
  const stats: ValidationStats = { cycles: 0, events: 0, chunks: 0 };
  let bundle: BundleSource | undefined;

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
    if (errors.length > 0) {
      return { valid: false, errors, warnings, stats };
    }

    const [manifest, topology, index] = await Promise.all([
      parseRequired(bundle, "manifest.json", parseManifest, errors),
      parseRequired(
        bundle,
        "topology.json",
        (value) => TopologySchema.parse(value) as TopologyDescriptor,
        errors,
      ),
      parseRequired(bundle, "index.json", parseIndex, errors),
      parseRequired(bundle, "strings.json", (value) => value, errors),
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

    const topologyResult = validateTopology(topology);
    errors.push(...topologyResult.errors);
    warnings.push(...topologyResult.warnings);

    if (index.schemaVersion !== manifest.schemaVersion) {
      errors.push(
        diagnostic(
          "schema_version_mismatch",
          "index.json.schemaVersion",
          `index schema ${index.schemaVersion} does not match manifest schema ${manifest.schemaVersion}`,
        ),
      );
    }
    if (topology.schemaVersion !== manifest.schemaVersion) {
      errors.push(
        diagnostic(
          "schema_version_mismatch",
          "topology.json.schemaVersion",
          `topology schema ${topology.schemaVersion} does not match manifest schema ${manifest.schemaVersion}`,
        ),
      );
    }

    const events = await readChunkEvents(bundle, index, manifest, errors);
    const references = validateEventReferences(topology, events);
    errors.push(...references.errors);
    warnings.push(...references.warnings);

    if (
      manifest.chunkCount !== index.chunks.length ||
      manifest.eventCount !== events.length ||
      (events.length > 0 &&
        (events[0]?.cycle !== manifest.firstCycle ||
          events.at(-1)?.cycle !== manifest.lastCycle))
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
        "bundle_io",
        path,
        error instanceof Error ? error.message : "could not read bundle",
      ),
    );
    return { valid: false, errors, warnings, stats };
  } finally {
    await bundle?.close();
  }
}
