import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";

import {
  parseSimTraceCheckpoint,
  parseSimTraceEvents,
  parseSimTraceIndex,
  parseSimTraceManifest,
  validateSimTraceRun,
  type SimTraceCheckpoint,
  type SimTraceEvent,
  type SimTraceIndex,
  type SimTraceManifest,
} from "@linxsimcity/trace-schema";
import {
  topologyFingerprint,
  validateArchitectureTopology,
} from "@linxsimcity/world";
import type { ArchitectureTopology } from "@linxsimcity/world";

import { CORE_CATALOG } from "@linxsimcity/component-catalog";

export interface SimTraceBundleDiagnostic {
  readonly code:
    | "bundle_binding"
    | "bundle_hash"
    | "bundle_size"
    | "chunk_bounds"
    | "chunk_count"
    | "chunk_order"
    | "checkpoint_binding"
    | "checkpoint_state"
    | "manifest_event_count"
    | "trace_semantics";
  readonly path: string;
  readonly message: string;
}

export interface SimTraceBundleValidationResult {
  readonly directory: string;
  readonly manifest: SimTraceManifest;
  readonly topology: ArchitectureTopology;
  readonly index: SimTraceIndex;
  readonly events: readonly SimTraceEvent[];
  readonly checkpoints: readonly SimTraceCheckpoint[];
  readonly diagnostics: readonly SimTraceBundleDiagnostic[];
}

function jsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function topologyDocument(value: unknown): ArchitectureTopology {
  if (!value || typeof value !== "object") {
    throw new Error("topology document must be an object");
  }
  const candidate = value as Partial<ArchitectureTopology>;
  if (
    candidate.schema !== "linxsimcity.topology" ||
    candidate.schemaVersion !== "1" ||
    !Array.isArray(candidate.nodes) ||
    !Array.isArray(candidate.edges)
  ) {
    throw new Error("topology document is not the current LinxSimCity format");
  }
  return candidate as ArchitectureTopology;
}

function bundlePath(directory: string, entryPath: string): string {
  if (isAbsolute(entryPath)) {
    throw new Error(`bundle path must be relative: ${entryPath}`);
  }
  const resolved = resolve(directory, entryPath);
  const child = relative(directory, resolved);
  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error(`bundle path escapes its directory: ${entryPath}`);
  }
  return resolved;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function compressedJson(path: string): { bytes: Buffer; value: unknown } {
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(gunzipSync(bytes).toString("utf8")) };
}

function compressedJsonLines(path: string): {
  bytes: Buffer;
  values: unknown[];
} {
  const bytes = readFileSync(path);
  const source = gunzipSync(bytes).toString("utf8");
  const lines = source.split(/\r?\n/u).filter((line) => line.trim() !== "");
  return { bytes, values: lines.map((line) => JSON.parse(line) as unknown) };
}

function addFileIntegrityDiagnostics(
  diagnostics: SimTraceBundleDiagnostic[],
  path: string,
  bytes: Buffer,
  expectedSha256: string,
  expectedSize: number,
): void {
  if (bytes.length !== expectedSize) {
    diagnostics.push({
      code: "bundle_size",
      path,
      message: `compressed size ${bytes.length} does not match index value ${expectedSize}`,
    });
  }
  const actualHash = sha256(bytes);
  if (actualHash !== expectedSha256) {
    diagnostics.push({
      code: "bundle_hash",
      path,
      message: `SHA-256 ${actualHash} does not match index value`,
    });
  }
}

function checkpointStateDiagnostics(
  checkpoint: SimTraceCheckpoint,
  topologyNodeIds: ReadonlySet<string>,
  path: string,
): SimTraceBundleDiagnostic[] {
  const diagnostics: SimTraceBundleDiagnostic[] = [];
  const queueTokenIds = checkpoint.state.queueTokens.map(
    (item) => item.tokenId,
  );
  const residencyIds = checkpoint.state.tileResidencies.map(
    (item) => item.residencyId,
  );
  const computationIds = checkpoint.state.computations.map(
    (item) => item.tokenId,
  );
  const occupancyIds = checkpoint.state.queueOccupancy.map(
    (item) => item.queueId,
  );
  const associationIds = checkpoint.state.associations.map(
    (item) =>
      `${item.tokenId}\u0000${item.tileId}\u0000${item.version}\u0000${item.relation}`,
  );
  for (const [field, ids] of [
    ["queueTokens", queueTokenIds],
    ["queueOccupancy", occupancyIds],
    ["tileResidencies", residencyIds],
    ["associations", associationIds],
    ["computations", computationIds],
  ] as const) {
    if (new Set(ids).size !== ids.length) {
      diagnostics.push({
        code: "checkpoint_state",
        path: `${path}.state.${field}`,
        message: `${field} contains duplicate identities`,
      });
    }
  }
  const occupancyByQueue = new Map(
    checkpoint.state.queueOccupancy.map((item) => [item.queueId, item]),
  );
  for (const occupancy of checkpoint.state.queueOccupancy) {
    const tokens = checkpoint.state.queueTokens.filter(
      (item) => item.queueId === occupancy.queueId,
    );
    if (tokens.length !== occupancy.occupancy) {
      diagnostics.push({
        code: "checkpoint_state",
        path: `${path}.state.queueOccupancy`,
        message: `queue ${occupancy.queueId} occupancy does not match its tokens`,
      });
    }
    const slots = tokens.map((item) => item.slot);
    if (
      new Set(slots).size !== slots.length ||
      slots.some((slot) => slot >= occupancy.capacity)
    ) {
      diagnostics.push({
        code: "checkpoint_state",
        path: `${path}.state.queueTokens`,
        message: `queue ${occupancy.queueId} has duplicate or out-of-range slots`,
      });
    }
  }
  for (const token of checkpoint.state.queueTokens) {
    if (!occupancyByQueue.has(token.queueId)) {
      diagnostics.push({
        code: "checkpoint_state",
        path: `${path}.state.queueTokens`,
        message: `queue ${token.queueId} has tokens but no occupancy record`,
      });
    }
  }
  const referencedNodes = [
    ...checkpoint.state.queueTokens.flatMap((item) => [item.queueId]),
    ...checkpoint.state.queueOccupancy.flatMap((item) => [item.queueId]),
    ...checkpoint.state.tileResidencies.flatMap((item) => [item.storageNodeId]),
    ...checkpoint.state.computations.flatMap((item) => [item.entityId]),
  ];
  for (const nodeId of referencedNodes) {
    if (!topologyNodeIds.has(nodeId)) {
      diagnostics.push({
        code: "checkpoint_state",
        path: `${path}.state`,
        message: `checkpoint references topology entity ${nodeId} that does not exist`,
      });
    }
  }
  return diagnostics;
}

export function validateTraceBundle(
  directoryArgument: string,
): SimTraceBundleValidationResult {
  const directory = resolve(directoryArgument);
  if (!statSync(directory).isDirectory()) {
    throw new Error(`trace bundle is not a directory: ${directory}`);
  }
  const manifest = parseSimTraceManifest(
    jsonFile(resolve(directory, "manifest.json")),
  );
  const topology = topologyDocument(
    jsonFile(resolve(directory, "topology.json")),
  );
  const topologyProblems = validateArchitectureTopology(topology, CORE_CATALOG);
  if (topologyProblems.length > 0) {
    throw new Error(
      `invalid topology: ${topologyProblems[0]!.path} ${topologyProblems[0]!.message}`,
    );
  }
  const index = parseSimTraceIndex(jsonFile(resolve(directory, "index.json")));
  const fingerprint = topologyFingerprint(topology);
  const diagnostics: SimTraceBundleDiagnostic[] = [];
  for (const [path, actual, expected] of [
    ["index.runId", index.runId, manifest.runId],
    [
      "index.topologyFingerprint",
      index.topologyFingerprint,
      manifest.topologyFingerprint,
    ],
    ["manifest.topologyFingerprint", manifest.topologyFingerprint, fingerprint],
  ] as const) {
    if (actual !== expected) {
      diagnostics.push({
        code: "bundle_binding",
        path,
        message: `${actual} does not match ${expected}`,
      });
    }
  }

  const domainIds = new Set(manifest.timeDomains.map((item) => item.id));
  const checkpoints: SimTraceCheckpoint[] = [];
  const checkpointsById = new Map<string, SimTraceCheckpoint>();
  for (const entry of index.checkpoints) {
    const path = bundlePath(directory, entry.path);
    const compressed = compressedJson(path);
    addFileIntegrityDiagnostics(
      diagnostics,
      entry.path,
      compressed.bytes,
      entry.sha256,
      entry.compressedBytes,
    );
    const checkpoint = parseSimTraceCheckpoint(compressed.value);
    checkpoints.push(checkpoint);
    checkpointsById.set(entry.id, checkpoint);
    const bindings = [
      ["runId", checkpoint.runId, manifest.runId],
      [
        "topologyFingerprint",
        checkpoint.topologyFingerprint,
        manifest.topologyFingerprint,
      ],
      ["timeDomain", checkpoint.timeDomain, entry.timeDomain],
      ["cycle", checkpoint.cycle, entry.cycle],
      ["eventOrdinal", checkpoint.eventOrdinal, entry.eventOrdinal],
    ] as const;
    for (const [field, actual, expected] of bindings) {
      if (actual !== expected) {
        diagnostics.push({
          code: "checkpoint_binding",
          path: `${entry.path}.${field}`,
          message: `${actual} does not match index value ${expected}`,
        });
      }
    }
    if (!domainIds.has(checkpoint.timeDomain)) {
      diagnostics.push({
        code: "checkpoint_binding",
        path: `${entry.path}.timeDomain`,
        message: "checkpoint references an undeclared time domain",
      });
    }
    if (
      BigInt(checkpoint.cycle) < BigInt(manifest.window.firstCycle) ||
      BigInt(checkpoint.cycle) > BigInt(manifest.window.lastCycle) ||
      BigInt(checkpoint.eventOrdinal) > BigInt(manifest.eventCount)
    ) {
      diagnostics.push({
        code: "checkpoint_binding",
        path: entry.path,
        message: "checkpoint position is outside the manifest window",
      });
    }
    diagnostics.push(
      ...checkpointStateDiagnostics(
        checkpoint,
        new Set(topology.nodes.map((node) => node.id)),
        entry.path,
      ),
    );
  }

  const events: SimTraceEvent[] = [];
  const previousLastCycleByDomain = new Map<string, bigint>();
  for (const entry of index.chunks) {
    const path = bundlePath(directory, entry.path);
    const compressed = compressedJsonLines(path);
    addFileIntegrityDiagnostics(
      diagnostics,
      entry.path,
      compressed.bytes,
      entry.sha256,
      entry.compressedBytes,
    );
    const chunkEvents = parseSimTraceEvents(compressed.values);
    events.push(...chunkEvents);
    if (!domainIds.has(entry.timeDomain)) {
      diagnostics.push({
        code: "bundle_binding",
        path: `${entry.path}.timeDomain`,
        message: "chunk references an undeclared time domain",
      });
    }
    if (BigInt(entry.eventCount) !== BigInt(chunkEvents.length)) {
      diagnostics.push({
        code: "chunk_count",
        path: `${entry.path}.eventCount`,
        message: "parsed event count does not match index entry",
      });
    }
    const first = chunkEvents[0];
    const last = chunkEvents.at(-1);
    if (
      !first ||
      !last ||
      first.cycle !== entry.firstCycle ||
      last.cycle !== entry.lastCycle ||
      chunkEvents.some((event) => event.timeDomain !== entry.timeDomain)
    ) {
      diagnostics.push({
        code: "chunk_bounds",
        path: entry.path,
        message: "chunk contents do not match indexed domain and cycle bounds",
      });
    }
    const previousLastCycle = previousLastCycleByDomain.get(entry.timeDomain);
    if (
      previousLastCycle !== undefined &&
      previousLastCycle > BigInt(entry.firstCycle)
    ) {
      diagnostics.push({
        code: "chunk_order",
        path: entry.path,
        message: "chunk cycle ranges are out of order for their time domain",
      });
    }
    previousLastCycleByDomain.set(entry.timeDomain, BigInt(entry.lastCycle));
    const checkpoint = checkpointsById.get(entry.checkpointId);
    if (
      checkpoint &&
      (checkpoint.timeDomain !== entry.timeDomain ||
        BigInt(checkpoint.cycle) > BigInt(entry.firstCycle))
    ) {
      diagnostics.push({
        code: "checkpoint_binding",
        path: `${entry.path}.checkpointId`,
        message:
          "chunk checkpoint must precede the chunk in the same time domain",
      });
    }
  }
  if (BigInt(manifest.eventCount) !== BigInt(events.length)) {
    diagnostics.push({
      code: "manifest_event_count",
      path: "manifest.eventCount",
      message: "manifest event count does not match all parsed chunks",
    });
  }
  diagnostics.push(
    ...validateSimTraceRun(
      { manifest, events },
      {
        topologyFingerprint: fingerprint,
        topologyNodeIds: new Set(topology.nodes.map((node) => node.id)),
      },
    ).map((item) => ({
      code: "trace_semantics" as const,
      path: item.path,
      message: `${item.code}: ${item.message}`,
    })),
  );
  return {
    directory,
    manifest,
    topology,
    index,
    events,
    checkpoints,
    diagnostics,
  };
}
