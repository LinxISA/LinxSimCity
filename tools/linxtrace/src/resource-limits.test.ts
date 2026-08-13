import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { afterEach, expect, test } from "vitest";

import { rebuildIndex } from "./index-command.js";
import { ResourceLimitError } from "./io.js";
import { DEFAULT_RESOURCE_LIMITS } from "./limits.js";
import { validateBundle } from "./validate.js";

interface TestBundle {
  directory: string;
  compressedBytes: number[];
  checkpointBytes: number;
}

const testDirectories: string[] = [];

async function testDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "linxtrace-limits-"));
  testDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    testDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("default metadata budget accommodates fully placed physical topologies", () => {
  expect(DEFAULT_RESOURCE_LIMITS.metadataEntryBytes).toBeGreaterThanOrEqual(
    32 * 1024 * 1024,
  );
  expect(DEFAULT_RESOURCE_LIMITS.totalMetadataBytes).toBeGreaterThan(
    DEFAULT_RESOURCE_LIMITS.metadataEntryBytes,
  );
});

async function writeMultiChunkBundle(directory: string): Promise<TestBundle> {
  await mkdir(join(directory, "chunks"), { recursive: true });
  await mkdir(join(directory, "checkpoints"), { recursive: true });
  const chunkEvents = [
    [
      { cycle: 0, seq: 0 },
      { cycle: 1, seq: 0 },
    ],
    [
      { cycle: 2, seq: 0 },
      { cycle: 3, seq: 0 },
    ],
  ].map((events) =>
    events.map((order) => ({
      ...order,
      type: "pipeline.enter",
      scope: "pe0",
      entity_id: "pe0.fetch",
      payload: {},
    })),
  );
  const chunks = chunkEvents.map((events) =>
    gzipSync(`${events.map(JSON.stringify).join("\n")}\n`, { mtime: 0 }),
  );
  const checkpoint = gzipSync(
    JSON.stringify({ cycle: 0, seq: 0, entities: {} }),
    { mtime: 0 },
  );
  await Promise.all([
    writeFile(
      join(directory, "manifest.json"),
      JSON.stringify({
        schemaVersion: "1.0.0",
        modelVersion: "test",
        profile: "pipeline",
        firstCycle: 0,
        lastCycle: 3,
        eventCount: 4,
        chunkCount: 2,
        chunkCycleSpan: 2,
        checkpointCycleSpan: 4096,
      }),
    ),
    writeFile(
      join(directory, "topology.json"),
      JSON.stringify({
        schemaVersion: "1.0.0",
        entities: [
          {
            id: "pe0.fetch",
            kind: "module",
            label: "Fetch",
            instance: {},
          },
        ],
      }),
    ),
    writeFile(join(directory, "strings.json"), "{}"),
    writeFile(join(directory, "chunks/000000.jsonl.gz"), chunks[0]!),
    writeFile(join(directory, "chunks/000001.jsonl.gz"), chunks[1]!),
    writeFile(join(directory, "checkpoints/000000.json.gz"), checkpoint),
    writeFile(
      join(directory, "index.json"),
      JSON.stringify({
        schemaVersion: "1.0.0",
        chunks: chunks.map((compressed, index) => ({
          path: `chunks/${index.toString().padStart(6, "0")}.jsonl.gz`,
          firstCycle: index * 2,
          lastCycle: index * 2 + 1,
          eventCount: 2,
          compressedBytes: compressed.byteLength,
          sha256: createHash("sha256").update(compressed).digest("hex"),
          checkpointPath: "checkpoints/000000.json.gz",
        })),
      }),
    ),
  ]);
  return {
    directory,
    compressedBytes: chunks.map(({ byteLength }) => byteLength),
    checkpointBytes: checkpoint.byteLength,
  };
}

test("validation aborts at an event-budget crossing within a chunk", async () => {
  const bundle = await writeMultiChunkBundle(await testDirectory());
  const oversizedChunk = gzipSync(
    `${[
      { cycle: 0, seq: 0, entity_id: "pe0.fetch" },
      { cycle: 1, seq: 0, entity_id: "pe0.fetch" },
      { cycle: 1, seq: 1, entity_id: "missing.after.limit" },
    ]
      .map((order) =>
        JSON.stringify({
          ...order,
          type: "pipeline.enter",
          scope: "pe0",
          payload: {},
        }),
      )
      .join("\n")}\n`,
    { mtime: 0 },
  );
  await writeFile(
    join(bundle.directory, "chunks/000000.jsonl.gz"),
    oversizedChunk,
  );
  const manifestPath = join(bundle.directory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
    string,
    unknown
  >;
  manifest.eventCount = 1;
  await writeFile(manifestPath, JSON.stringify(manifest));

  const report = await validateBundle(bundle.directory, {
    limits: { events: 1 },
  });

  expect(report.errors).toContainEqual(
    expect.objectContaining({ code: "resource_limit" }),
  );
  expect(report.errors).not.toContainEqual(
    expect.objectContaining({ code: "missing_entity_reference" }),
  );
});

test("malformed records still consume event budget before schema parsing", async () => {
  const bundle = await writeMultiChunkBundle(await testDirectory());
  const chunk = gzipSync(
    `${JSON.stringify({
      cycle: 0,
      seq: 0,
      type: "pipeline.enter",
      scope: "pe0",
      entity_id: "pe0.fetch",
      payload: {},
    })}\n{not-json}\n`,
    { mtime: 0 },
  );
  await writeFile(join(bundle.directory, "chunks/000000.jsonl.gz"), chunk);

  const report = await validateBundle(bundle.directory, {
    limits: { events: 1 },
  });

  expect(report.errors).toContainEqual(
    expect.objectContaining({ code: "resource_limit" }),
  );
  expect(report.errors).not.toContainEqual(
    expect.objectContaining({
      code: "schema_validation",
      path: expect.stringContaining("chunks/000000.jsonl.gz:2"),
    }),
  );
});

test("validation applies compressed budget bundle-wide and caches checkpoints", async () => {
  const bundle = await writeMultiChunkBundle(await testDirectory());
  const exactBudget =
    bundle.compressedBytes.reduce((sum, bytes) => sum + bytes, 0) +
    bundle.checkpointBytes;

  const valid = await validateBundle(bundle.directory, {
    limits: { totalCompressedBytes: exactBudget },
  });
  const overBudget = await validateBundle(bundle.directory, {
    limits: { totalCompressedBytes: exactBudget - 1 },
  });

  expect(valid.valid).toBe(true);
  expect(overBudget.errors).toContainEqual(
    expect.objectContaining({ code: "resource_limit" }),
  );
});

test("an invalid shared checkpoint is read and charged only once", async () => {
  const bundle = await writeMultiChunkBundle(await testDirectory());
  const malformedCheckpoint = gzipSync("{not-json}", { mtime: 0 });
  await writeFile(
    join(bundle.directory, "checkpoints/000000.json.gz"),
    malformedCheckpoint,
  );
  const exactBudget =
    bundle.compressedBytes.reduce((sum, bytes) => sum + bytes, 0) +
    malformedCheckpoint.byteLength;

  const report = await validateBundle(bundle.directory, {
    limits: { totalCompressedBytes: exactBudget },
  });

  expect(report.errors).not.toContainEqual(
    expect.objectContaining({ code: "resource_limit" }),
  );
  expect(
    report.errors.filter(
      ({ path, code }) =>
        path === "checkpoints/000000.json.gz" && code === "schema_validation",
    ),
  ).toHaveLength(1);
});

test("checkpoint resource exhaustion terminates validation", async () => {
  const bundle = await writeMultiChunkBundle(await testDirectory());
  const firstChunkBytes = bundle.compressedBytes[0]!;

  const report = await validateBundle(bundle.directory, {
    limits: {
      totalCompressedBytes: firstChunkBytes + bundle.checkpointBytes - 1,
    },
  });

  expect(
    report.errors.filter(({ code }) => code === "resource_limit"),
  ).toHaveLength(1);
});

test("index uses one event budget across all chunks", async () => {
  const bundle = await writeMultiChunkBundle(await testDirectory());

  await expect(
    rebuildIndex(bundle.directory, { limits: { events: 3 } }),
  ).rejects.toBeInstanceOf(ResourceLimitError);
});
