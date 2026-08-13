import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { expect, test } from "vitest";

const defaultTrace = new URL(
  "../../apps/viewer/public/traces/supernpubench-fa-250-blocks/",
  import.meta.url,
);

interface TraceEvent {
  readonly type: string;
  readonly scope: string;
  readonly entity_id: string;
  readonly payload: Record<string, unknown>;
}

async function inspectEvents(paths: readonly string[]) {
  const counts = new Map<string, number>();
  const samples = new Map<string, TraceEvent>();

  for (const path of paths) {
    const lines = createInterface({
      input: createReadStream(new URL(path, defaultTrace)).pipe(createGunzip()),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      if (!line) continue;
      const event = JSON.parse(line) as TraceEvent;
      counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
      samples.set(event.type, samples.get(event.type) ?? event);
    }
  }
  return { counts, samples };
}

test("the hosted FA logical bundle exposes physical instruction observability", async () => {
  const manifest = JSON.parse(
    readFileSync(new URL("manifest.json", defaultTrace), "utf8"),
  ) as {
    eventCount: number;
    chunkCount: number;
    capabilities: string[];
  };
  expect(manifest).toMatchObject({ eventCount: 199_585, chunkCount: 3 });
  expect(manifest.capabilities).toEqual([
    "physical-layout-v1",
    "instruction-causality-v1",
    "shared-cache-v1",
    "cell-128b-v1",
    "tlsu-detail-v1",
  ]);

  const topology = JSON.parse(
    readFileSync(new URL("topology.json", defaultTrace), "utf8"),
  ) as { entities: Array<{ kind: string }> };
  const entityCounts = new Map<string, number>();
  for (const { kind } of topology.entities) {
    entityCounts.set(kind, (entityCounts.get(kind) ?? 0) + 1);
  }
  expect(topology.entities).toHaveLength(86_138);
  expect(entityCounts.get("cell")).toBe(81_920);
  expect(entityCounts.get("cache-line")).toBe(2_048);
  expect(entityCounts.get("rob-slot")).toBe(512);
  expect(entityCounts.get("register")).toBe(1_024);
  expect(entityCounts.get("pipe")).toBe(56);

  const index = JSON.parse(
    readFileSync(new URL("index.json", defaultTrace), "utf8"),
  ) as { chunks: Array<{ path: string; eventCount: number }> };
  expect(index.chunks.reduce((sum, chunk) => sum + chunk.eventCount, 0)).toBe(
    manifest.eventCount,
  );

  const { counts, samples } = await inspectEvents(
    index.chunks.map(({ path }) => path),
  );
  expect([...counts.values()].reduce((sum, count) => sum + count, 0)).toBe(
    manifest.eventCount,
  );
  for (const required of [
    "rob.retire",
    "pipeline.enter",
    "pipe.transfer",
    "register.read",
    "register.write",
    "cache.access",
    "cache.hit",
    "cache.miss",
    "cell.read",
    "cell.write",
    "crossbar.request",
    "cube.stage",
    "memory.request",
  ]) {
    expect(counts.get(required), required).toBeGreaterThan(0);
  }

  expect(samples.get("rob.retire")?.payload).toMatchObject({
    instruction_id: expect.any(Number),
    thread_id: expect.any(Number),
    rob_slot: expect.any(Number),
    stage_id: "retire",
  });
  expect(samples.get("register.read")?.payload).toMatchObject({
    phys_reg: expect.any(Number),
    instruction_id: expect.any(Number),
    thread_id: expect.any(Number),
  });
  expect(samples.get("cache.access")?.payload).toMatchObject({
    address: expect.any(Number),
    line_address: expect.any(Number),
    set: expect.any(Number),
    tag: expect.any(Number),
  });
  expect(samples.get("cell.read")?.payload).toMatchObject({
    phys_cell_id: expect.any(Number),
    bank: expect.any(Number),
    row: expect.any(Number),
    bytes: 128,
  });
  expect(samples.get("memory.request")?.payload).toMatchObject({
    route_id: expect.stringMatching(/^tlsu\./),
    stage_id: expect.any(String),
    address: expect.any(Number),
  });
});
