import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { TextEncoder } from "node:util";
import { gzipSync } from "node:zlib";

export const PERFORMANCE_FIXTURE_SCHEMA = "linxsimcity.performance-fixture";
export const PERFORMANCE_FIXTURE_VERSION = 1;

/**
 * @typedef {object} FixtureOptions
 * @property {number} queueInstances
 * @property {number} tableInstances
 * @property {number} computeInstances
 * @property {number} entriesPerStorageInstance
 * @property {number} activeTokens
 * @property {number} eventCount
 * @property {number} eventsPerChunk
 */

/**
 * @typedef {FixtureOptions & {
 *   renderableInstances: number,
 *   logicalEntries: number,
 *   chunkCount: number,
 * }} FixturePlan
 */

/** @typedef {import("../../packages/topology/src/types.js").ArchitectureTopology} ArchitectureTopology */

/** @type {Readonly<FixtureOptions>} */
export const DEFAULT_FIXTURE_OPTIONS = Object.freeze({
  queueInstances: 100,
  tableInstances: 100,
  computeInstances: 40,
  entriesPerStorageInstance: 100,
  activeTokens: 1_000,
  eventCount: 1_000_000,
  eventsPerChunk: 10_000,
});

/** @param {Buffer | string} value */
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** @param {unknown} value @returns {string} */
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
    .join(",")}}`;
}

/** @param {ArchitectureTopology} topology */
export function topologyFingerprint(topology) {
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
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...topology.edges]
      .map(({ id, from, to }) => ({ id, from, to }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(stable(normalized))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

/** @returns {import("../../packages/component-catalog/src/types.js").PhysicalArea} */
function unknownArea() {
  return {
    value: null,
    unit: "um2",
    status: "unknown",
    source: "performance-fixture:no-ppa-area",
  };
}

/** @param {Partial<FixtureOptions>} [overrides] @returns {Readonly<FixturePlan>} */
export function fixturePlan(overrides = {}) {
  const options = { ...DEFAULT_FIXTURE_OPTIONS, ...overrides };
  for (const [name, value] of Object.entries(options)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`${name} must be a positive safe integer`);
    }
  }
  const renderableInstances =
    options.queueInstances + options.tableInstances + options.computeInstances;
  const logicalEntries =
    (options.queueInstances + options.tableInstances) *
    options.entriesPerStorageInstance;
  const chunkCount = Math.ceil(options.eventCount / options.eventsPerChunk);
  if (
    options.activeTokens >
    options.queueInstances * options.entriesPerStorageInstance
  ) {
    throw new RangeError("activeTokens exceed aggregate Queue capacity");
  }
  return Object.freeze({
    ...options,
    renderableInstances,
    logicalEntries,
    chunkCount,
  });
}

/** @param {FixturePlan} plan @returns {ArchitectureTopology} */
export function buildPerformanceTopology(plan = fixturePlan()) {
  /** @type {import("../../packages/topology/src/types.js").TopologyNode[]} */
  const nodes = [
    {
      id: "scope.performance",
      definitionId: "core.container",
      label: "M8 Performance District",
      parameters: {},
      area: {
        value: null,
        unit: "um2",
        status: "aggregate",
        source: "performance-fixture:aggregate",
      },
    },
  ];
  for (let index = 0; index < plan.queueInstances; index += 1) {
    nodes.push({
      id: `queue.${String(index).padStart(3, "0")}`,
      definitionId: "core.queue",
      label: `Queue ${index}`,
      parentId: "scope.performance",
      parameters: { capacity: plan.entriesPerStorageInstance, latency: 1 },
      attributes: {
        performanceFixture: true,
        logicalEntries: plan.entriesPerStorageInstance,
      },
      area: unknownArea(),
    });
  }
  for (let index = 0; index < plan.tableInstances; index += 1) {
    nodes.push({
      id: `table.${String(index).padStart(3, "0")}`,
      definitionId: "core.table",
      label: `Table ${index}`,
      parentId: "scope.performance",
      parameters: { entries: plan.entriesPerStorageInstance },
      attributes: {
        performanceFixture: true,
        logicalEntries: plan.entriesPerStorageInstance,
      },
      area: unknownArea(),
    });
  }
  for (let index = 0; index < plan.computeInstances; index += 1) {
    nodes.push({
      id: `vector.${String(index).padStart(3, "0")}`,
      definitionId: "core.vector",
      label: `Vector Engine ${index}`,
      parentId: "scope.performance",
      parameters: { lanes: 8 },
      attributes: { performanceFixture: true },
      area: unknownArea(),
    });
  }
  return {
    schema: "linxsimcity.topology",
    schemaVersion: "1",
    id: "m8.large-scene",
    name: "M8 deterministic large scene",
    revision: "performance-v1",
    nodes,
    edges: [],
  };
}

/** @param {FixturePlan} plan @param {string} fingerprint */
export function buildTraceManifest(plan, fingerprint) {
  return {
    schema: "linxsimcity.trace",
    schemaVersion: "1",
    runId: "m8-performance-v1",
    topologyFingerprint: fingerprint,
    simulator: {
      name: "linxsimcity-performance-fixture",
      revision: "1",
      configSha256: sha256(stable(plan)),
    },
    workload: {
      name: "deterministic-million-event-playback",
      sha256: sha256("linxsimcity-m8-performance-workload-v1"),
    },
    timeDomains: [
      {
        id: "core",
        unit: "cycle",
        tickRatio: { numerator: 1, denominator: 1 },
      },
    ],
    window: {
      firstCycle: "0",
      lastCycle: String(plan.eventCount - 1),
      startsFromReset: false,
      complete: true,
    },
    eventCount: String(plan.eventCount),
    capabilities: ["queue-lifecycle"],
    loss: { droppedEvents: "0", truncated: false },
  };
}

/** @param {FixturePlan} plan @param {string} fingerprint @param {number} ordinal */
function checkpoint(plan, fingerprint, ordinal) {
  const queueTokens = Array.from({ length: plan.activeTokens }, (_, index) => ({
    tokenId: `active.${String(index).padStart(4, "0")}`,
    queueId: `queue.${String(Math.floor(index / plan.entriesPerStorageInstance)).padStart(3, "0")}`,
    state: "visible",
    slot: index % plan.entriesPerStorageInstance,
  }));
  const occupiedQueues = Math.ceil(
    plan.activeTokens / plan.entriesPerStorageInstance,
  );
  const queueOccupancy = Array.from({ length: occupiedQueues }, (_, index) => ({
    queueId: `queue.${String(index).padStart(3, "0")}`,
    occupancy: Math.min(
      plan.entriesPerStorageInstance,
      plan.activeTokens - index * plan.entriesPerStorageInstance,
    ),
    capacity: plan.entriesPerStorageInstance,
  }));
  return {
    schema: "linxsimcity.trace-checkpoint",
    schemaVersion: "1",
    runId: "m8-performance-v1",
    topologyFingerprint: fingerprint,
    timeDomain: "core",
    cycle: String(ordinal),
    eventOrdinal: String(ordinal),
    state: {
      queueTokens,
      queueOccupancy,
      tileResidencies: [],
      associations: [],
      computations: [],
    },
  };
}

/** @param {number} cycle @param {FixturePlan} plan */
function eventAt(cycle, plan) {
  const queueIndex = cycle % plan.queueInstances;
  return {
    timeDomain: "core",
    cycle: String(cycle),
    phase: "work",
    sequence: 0,
    type: "queue.backpressure",
    entityId: `queue.${String(queueIndex).padStart(3, "0")}`,
    payload: {
      tokenId: `active.${String(cycle % plan.activeTokens).padStart(4, "0")}`,
      occupancy: Math.min(plan.entriesPerStorageInstance, 10),
      capacity: plan.entriesPerStorageInstance,
      reason: "deterministic-performance-load",
    },
  };
}

/** @param {string} outputDirectory @param {Partial<FixtureOptions>} [overrides] */
export async function generatePerformanceFixture(
  outputDirectory,
  overrides = {},
) {
  const directory = resolve(outputDirectory);
  const plan = fixturePlan(overrides);
  const topology = buildPerformanceTopology(plan);
  const fingerprint = topologyFingerprint(topology);
  const manifest = buildTraceManifest(plan, fingerprint);
  await rm(directory, { recursive: true, force: true });
  await Promise.all([
    mkdir(join(directory, "chunks"), { recursive: true }),
    mkdir(join(directory, "checkpoints"), { recursive: true }),
  ]);
  const chunks = [];
  const checkpoints = [];
  for (let chunkIndex = 0; chunkIndex < plan.chunkCount; chunkIndex += 1) {
    const first = chunkIndex * plan.eventsPerChunk;
    const last = Math.min(plan.eventCount, first + plan.eventsPerChunk) - 1;
    const suffix = String(chunkIndex).padStart(6, "0");
    const checkpointValue = checkpoint(plan, fingerprint, first);
    const checkpointBytes = gzipSync(`${JSON.stringify(checkpointValue)}\n`, {
      level: 9,
    });
    const checkpointPath = `checkpoints/${suffix}.json.gz`;
    await writeFile(join(directory, checkpointPath), checkpointBytes);
    checkpoints.push({
      id: `checkpoint-${suffix}`,
      path: checkpointPath,
      timeDomain: "core",
      cycle: String(first),
      eventOrdinal: String(first),
      sha256: sha256(checkpointBytes),
      compressedBytes: checkpointBytes.length,
    });
    const lines = [];
    for (let cycle = first; cycle <= last; cycle += 1) {
      lines.push(JSON.stringify(eventAt(cycle, plan)));
    }
    const chunkBytes = gzipSync(`${lines.join("\n")}\n`, { level: 9 });
    const chunkPath = `chunks/${suffix}.jsonl.gz`;
    await writeFile(join(directory, chunkPath), chunkBytes);
    chunks.push({
      id: `chunk-${suffix}`,
      path: chunkPath,
      timeDomain: "core",
      firstCycle: String(first),
      lastCycle: String(last),
      eventCount: String(last - first + 1),
      sha256: sha256(chunkBytes),
      compressedBytes: chunkBytes.length,
      checkpointId: `checkpoint-${suffix}`,
    });
  }
  const index = {
    schema: "linxsimcity.trace-index",
    schemaVersion: "1",
    runId: manifest.runId,
    topologyFingerprint: fingerprint,
    chunks,
    checkpoints,
  };
  const fixtureHash = sha256(
    [stable(topology), stable(manifest), stable(index)].join("\n"),
  );
  const performance = {
    schema: PERFORMANCE_FIXTURE_SCHEMA,
    version: PERFORMANCE_FIXTURE_VERSION,
    fixtureHash,
    deterministicSeed: "linxsimcity-m8-v1",
    renderableInstances: plan.renderableInstances,
    topologyNodesIncludingContainers: topology.nodes.length,
    logicalEntries: plan.logicalEntries,
    activeTokens: plan.activeTokens,
    currentEvents: plan.eventCount,
    chunkCount: plan.chunkCount,
    note: "Renderable instances are generated topology nodes, not DavinciOO catalog candidates.",
  };
  await Promise.all([
    writeFile(
      join(directory, "topology.json"),
      `${JSON.stringify(topology, null, 2)}\n`,
    ),
    writeFile(
      join(directory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    ),
    writeFile(
      join(directory, "index.json"),
      `${JSON.stringify(index, null, 2)}\n`,
    ),
    writeFile(
      join(directory, "performance.json"),
      `${JSON.stringify(performance, null, 2)}\n`,
    ),
  ]);
  return { directory, plan, topology, manifest, index, performance };
}

/** @param {string} directory */
export async function readPerformanceFixtureManifest(directory) {
  const value = JSON.parse(
    await readFile(join(resolve(directory), "performance.json"), "utf8"),
  );
  if (
    value.schema !== PERFORMANCE_FIXTURE_SCHEMA ||
    value.version !== PERFORMANCE_FIXTURE_VERSION ||
    typeof value.fixtureHash !== "string"
  ) {
    throw new Error(
      `invalid performance fixture manifest in ${resolve(directory)}`,
    );
  }
  return value;
}
