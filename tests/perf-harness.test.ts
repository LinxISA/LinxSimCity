import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { afterEach, describe, expect, test } from "vitest";

import {
  buildPerformanceTopology,
  buildTraceManifest,
  fixturePlan,
  generatePerformanceFixture,
  topologyFingerprint,
} from "../scripts/perf/fixture.mjs";
import {
  PERFORMANCE_REPORT_SCHEMA,
  PERFORMANCE_REPORT_VERSION,
  validatePerformanceReport,
} from "../scripts/perf/harness.mjs";
import {
  evaluatePerformanceThresholds,
  percentile,
  summarizeSamples,
} from "../scripts/perf/stats.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("M8 performance fixture", () => {
  test("uses actual topology instances at the issue scale", () => {
    const plan = fixturePlan();
    const topology = buildPerformanceTopology(plan);
    const manifest = buildTraceManifest(plan, topologyFingerprint(topology));

    expect(plan).toMatchObject({
      renderableInstances: 240,
      logicalEntries: 20_000,
      activeTokens: 1_000,
      eventCount: 1_000_000,
      chunkCount: 100,
    });
    expect(topology.nodes).toHaveLength(241);
    expect(
      topology.nodes.filter((node) => node.parentId === "scope.performance"),
    ).toHaveLength(240);
    expect(manifest).toMatchObject({
      schema: "linxsimcity.trace",
      schemaVersion: "1",
      eventCount: "1000000",
      window: { firstCycle: "0", lastCycle: "999999" },
    });
  });

  test("writes a deterministic current bundle manifest and checkpoint", async () => {
    const directory = await mkdtemp(join(tmpdir(), "linxsimcity-perf-"));
    const secondDirectory = await mkdtemp(join(tmpdir(), "linxsimcity-perf-"));
    temporaryDirectories.push(directory, secondDirectory);
    const options = {
      queueInstances: 2,
      tableInstances: 1,
      computeInstances: 1,
      entriesPerStorageInstance: 4,
      activeTokens: 3,
      eventCount: 20,
      eventsPerChunk: 10,
    };
    const generated = await generatePerformanceFixture(directory, options);
    const repeated = await generatePerformanceFixture(secondDirectory, options);
    const [manifest, index, performance] = await Promise.all(
      ["manifest.json", "index.json", "performance.json"].map(async (file) =>
        JSON.parse(await readFile(join(directory, file), "utf8")),
      ),
    );
    const checkpoint = JSON.parse(
      gunzipSync(
        await readFile(join(directory, index.checkpoints[0].path)),
      ).toString("utf8"),
    );

    expect(manifest.eventCount).toBe("20");
    expect(index.chunks).toHaveLength(2);
    expect(index.checkpoints).toHaveLength(2);
    expect(checkpoint.state.queueTokens).toHaveLength(3);
    expect(performance).toMatchObject({
      fixtureHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      renderableInstances: 4,
      logicalEntries: 12,
      activeTokens: 3,
      currentEvents: 20,
    });
    expect(generated.performance.fixtureHash).toBe(performance.fixtureHash);
    expect(repeated.performance.fixtureHash).toBe(performance.fixtureHash);
    expect(repeated.index.chunks.map((chunk) => chunk.sha256)).toEqual(
      generated.index.chunks.map((chunk) => chunk.sha256),
    );
  });
});

describe("M8 performance statistics", () => {
  test("interpolates deterministic percentiles", () => {
    expect(percentile([40, 10, 30, 20], 0.5)).toBe(25);
    const summary = summarizeSamples([1, 2, 3, 4, 100]);
    expect(summary).toMatchObject({
      count: 5,
      p50Ms: 3,
      minMs: 1,
      maxMs: 100,
    });
    expect(summary.p95Ms).toBeCloseTo(80.8);
  });

  test("fails either hard threshold", () => {
    expect(
      evaluatePerformanceThresholds({
        frame: { p95Ms: 25 },
        seek: { p95Ms: 500 },
      }).pass,
    ).toBe(true);
    expect(
      evaluatePerformanceThresholds({
        frame: { p95Ms: 25.01 },
        seek: { p95Ms: 499 },
      }).pass,
    ).toBe(false);
  });

  test("requires raw samples, fixture identity, and the fixed viewport", () => {
    const report = {
      schema: PERFORMANCE_REPORT_SCHEMA,
      version: PERFORMANCE_REPORT_VERSION,
      fixture: { hash: "a".repeat(64) },
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
      rawSamples: {
        frameDurationMs: [16.7],
        warmSeekMs: Array.from({ length: 100 }, () => 12),
      },
    };
    expect(validatePerformanceReport(report)).toBe(report);
    expect(() =>
      validatePerformanceReport({
        ...report,
        rawSamples: { ...report.rawSamples, warmSeekMs: [12] },
      }),
    ).toThrow(/100 warm seek/u);
  });
});
