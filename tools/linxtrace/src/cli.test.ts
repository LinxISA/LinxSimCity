import { createHash } from "node:crypto";
import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";

import { Uint8ArrayReader, ZipReader } from "@zip.js/zip.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const cliPath = resolve(import.meta.dirname, "main.ts");
const tsxPath = resolve(repositoryRoot, "node_modules/tsx/dist/cli.mjs");

let testRoot: string;

function runCli(...args: string[]) {
  return spawnSync(process.execPath, [tsxPath, cliPath, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

async function writeBundle(
  directory: string,
  entityId = "pe0.fetch",
): Promise<void> {
  await mkdir(join(directory, "chunks"), { recursive: true });
  await mkdir(join(directory, "checkpoints"), { recursive: true });

  const events = [
    {
      cycle: 3,
      seq: 0,
      type: "pipeline.enter",
      scope: "pe0",
      entity_id: entityId,
      payload: { stage: "fetch" },
    },
    {
      cycle: 4,
      seq: 0,
      type: "pipeline.leave",
      scope: "pe0",
      entity_id: "pe0.fetch",
      payload: { stage: "fetch" },
    },
  ];
  const compressed = gzipSync(
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    { mtime: 0 },
  );
  const chunkPath = "chunks/000000.jsonl.gz";
  const checkpointPath = "checkpoints/000000.json.gz";

  await Promise.all([
    writeFile(
      join(directory, "manifest.json"),
      JSON.stringify({
        schemaVersion: "1.0.0",
        modelVersion: "test-model",
        profile: "pipeline",
        firstCycle: 3,
        lastCycle: 4,
        eventCount: 2,
        chunkCount: 1,
        chunkCycleSpan: 4096,
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
    writeFile(
      join(directory, "index.json"),
      JSON.stringify({
        schemaVersion: "1.0.0",
        chunks: [
          {
            path: chunkPath,
            firstCycle: 3,
            lastCycle: 4,
            eventCount: 2,
            compressedBytes: compressed.byteLength,
            sha256: createHash("sha256").update(compressed).digest("hex"),
            checkpointPath,
          },
        ],
      }),
    ),
    writeFile(join(directory, chunkPath), compressed),
    writeFile(
      join(directory, checkpointPath),
      gzipSync(JSON.stringify({ cycle: 0, seq: 0, entities: {} }), {
        mtime: 0,
      }),
    ),
  ]);
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function writeJson(
  path: string,
  value: Record<string, unknown>,
): Promise<void> {
  await writeFile(path, JSON.stringify(value));
}

beforeEach(async () => {
  testRoot = join(
    tmpdir(),
    `linxtrace-cli-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  await mkdir(testRoot, { recursive: true });
});

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

describe("linxtrace CLI", () => {
  test("validate reports a valid logical directory as JSON", async () => {
    const bundle = join(testRoot, "minimal.trace-dir");
    await writeBundle(bundle);

    const result = runCli("validate", bundle, "--json");

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      valid: true,
      errors: [],
      stats: { cycles: 2, events: 2, chunks: 1 },
    });
  });

  test("validate exits 2 for an event referencing a missing entity", async () => {
    const bundle = join(testRoot, "missing-entity.trace-dir");
    await writeBundle(bundle, "pe0.missing");

    const result = runCli("validate", bundle, "--json");

    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).errors).toContainEqual(
      expect.objectContaining({ code: "missing_entity_reference" }),
    );
  });

  test("inspect prints schema, profile, cycles, and events", async () => {
    const bundle = join(testRoot, "minimal.trace-dir");
    await writeBundle(bundle);

    const result = runCli("inspect", bundle);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Schema: 1.0.0");
    expect(result.stdout).toContain("Profile: pipeline");
    expect(result.stdout).toContain("Cycles: 3-4 (2)");
    expect(result.stdout).toContain("Events: 2");
  });

  test("packed ZIP validates identically and stores pre-gzipped entries", async () => {
    const bundle = join(testRoot, "minimal.trace-dir");
    const archive = join(testRoot, "minimal.linxtrace");
    await writeBundle(bundle);

    const packResult = runCli("pack", bundle, archive);
    const directoryResult = runCli("validate", bundle, "--json");
    const archiveResult = runCli("validate", archive, "--json");

    expect(packResult.status).toBe(0);
    expect(archiveResult.status).toBe(0);
    expect(JSON.parse(archiveResult.stdout)).toEqual(
      JSON.parse(directoryResult.stdout),
    );

    const reader = new ZipReader(new Uint8ArrayReader(await readFile(archive)));
    const entries = await reader.getEntries();
    expect(entries.map(({ filename }) => filename)).toEqual(
      entries.map(({ filename }) => filename).toSorted(),
    );
    expect(
      entries
        .filter(({ filename }) => filename.endsWith(".gz"))
        .every(({ compressionMethod }) => compressionMethod === 0),
    ).toBe(true);
    await reader.close();
  });

  test("index rebuilds chunk hashes, byte sizes, counts, and bounds", async () => {
    const bundle = join(testRoot, "minimal.trace-dir");
    await writeBundle(bundle);
    await writeJson(join(bundle, "index.json"), {
      schemaVersion: "1.0.0",
      chunks: [],
    });

    const indexResult = runCli("index", bundle);
    const validateResult = runCli("validate", bundle, "--json");

    expect(indexResult.status).toBe(0);
    expect(validateResult.status).toBe(0);
    const index = await readJson(join(bundle, "index.json"));
    expect(index.chunks).toEqual([
      expect.objectContaining({
        path: "chunks/000000.jsonl.gz",
        firstCycle: 3,
        lastCycle: 4,
        eventCount: 2,
        checkpointPath: "checkpoints/000000.json.gz",
      }),
    ]);
  });

  test("validation reports strict ordering, hashes, and index bounds", async () => {
    const bundle = join(testRoot, "broken.trace-dir");
    await writeBundle(bundle);
    const chunkPath = join(bundle, "chunks/000000.jsonl.gz");
    const compressed = gzipSync(
      [
        {
          cycle: 4,
          seq: 0,
          type: "pipeline.enter",
          scope: "pe0",
          entity_id: "pe0.fetch",
          payload: {},
        },
        {
          cycle: 3,
          seq: 0,
          type: "pipeline.leave",
          scope: "pe0",
          entity_id: "pe0.fetch",
          payload: {},
        },
      ]
        .map(JSON.stringify)
        .join("\n") + "\n",
      { mtime: 0 },
    );
    await writeFile(chunkPath, compressed);

    const result = runCli("validate", bundle, "--json");
    const codes = (JSON.parse(result.stdout).errors as { code: string }[]).map(
      ({ code }) => code,
    );

    expect(result.status).toBe(2);
    expect(codes).toContain("event_order");
    expect(codes).toContain("chunk_hash_mismatch");
    expect(codes).toContain("index_bounds_mismatch");
  });

  test("validation reports missing files and instance capacity violations", async () => {
    const bundle = join(testRoot, "capacity.trace-dir");
    await writeBundle(bundle);
    const topologyPath = join(bundle, "topology.json");
    await writeJson(topologyPath, {
      schemaVersion: "1.0.0",
      entities: [
        {
          id: "pe0.fetch",
          kind: "module",
          label: "Fetch",
          instance: {},
          capacity: 1,
        },
        {
          id: "pe0.fetch.slot1",
          kind: "queue-slot",
          parentId: "pe0.fetch",
          label: "Slot 1",
          instance: { index: 1 },
        },
      ],
    });
    await unlink(join(bundle, "strings.json"));

    const missingResult = runCli("validate", bundle, "--json");
    expect(missingResult.status).toBe(2);
    expect(JSON.parse(missingResult.stdout).errors).toContainEqual(
      expect.objectContaining({ code: "missing_required_file" }),
    );

    await writeFile(join(bundle, "strings.json"), "{}");
    const capacityResult = runCli("validate", bundle, "--json");
    expect(capacityResult.status).toBe(2);
    expect(JSON.parse(capacityResult.stdout).errors).toContainEqual(
      expect.objectContaining({ code: "instance_out_of_range" }),
    );
  });

  test("inspect supports JSON output", async () => {
    const bundle = join(testRoot, "minimal.trace-dir");
    await writeBundle(bundle);

    const result = runCli("inspect", bundle, "--json");

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schema: "1.0.0",
      profile: "pipeline",
      firstCycle: 3,
      lastCycle: 4,
      cycles: 2,
      events: 2,
      valid: true,
    });
  });

  test("rejects an incompatible topology schema version", async () => {
    const bundle = join(testRoot, "bad-topology-schema.trace-dir");
    await writeBundle(bundle);
    const topologyPath = join(bundle, "topology.json");
    const topology = await readJson(topologyPath);
    topology.schemaVersion = "2.0.0";
    await writeJson(topologyPath, topology);

    const result = runCli("validate", bundle, "--json");

    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).errors).toContainEqual(
      expect.objectContaining({ code: "schema_version_mismatch" }),
    );
  });
});
