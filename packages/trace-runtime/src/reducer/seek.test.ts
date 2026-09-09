import { resolve } from "node:path";

import { expect, test } from "vitest";

import { TraceBundleReader } from "../bundle/open-bundle.js";
import { reduceEvents } from "./reduce-event.js";
import { seekToCycle, seekToTargets, withTargetPositions } from "./seek.js";
import { initialSnapshot, snapshotStateHash } from "./state.js";

const fixture = resolve(
  import.meta.dirname,
  "../../../../fixtures/current/minimal.bundle",
);

function randomTargets(seed: number, count: number): string[] {
  let state = seed >>> 0;
  return Array.from({ length: count }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return String(state % 6);
  });
}

test("100 deterministic random checkpoint seeks match ordered replay hashes", async () => {
  const reader = await TraceBundleReader.open({
    kind: "node-directory",
    path: fixture,
  });
  const [manifest, topology, index] = await Promise.all([
    reader.readManifest(),
    reader.readTopology(),
    reader.readIndex(),
  ]);
  const events = (
    await Promise.all(index.chunks.map((chunk) => reader.readChunk(chunk)))
  ).flat();
  for (const cycle of randomTargets(0x5eed, 100)) {
    const target = [{ timeDomain: "core", cycle }];
    const linear = withTargetPositions(
      reduceEvents(
        initialSnapshot(
          topology,
          manifest.timeDomains.map((domain) => domain.id),
        ),
        events.filter((event) => BigInt(event.cycle) <= BigInt(cycle)),
      ),
      target,
    );
    expect(snapshotStateHash(await seekToTargets(reader, target))).toBe(
      snapshotStateHash(linear),
    );
  }
  await reader.close();
});

test("fixture seek exposes queue slots, Tile residency, and compute lifecycle", async () => {
  const reader = await TraceBundleReader.open({
    kind: "node-directory",
    path: fixture,
  });
  const visible = await seekToCycle(reader, "core", "2");
  expect(visible.positions).toEqual([
    {
      timeDomain: "core",
      cycle: "2",
      phase: "async",
      sequence: Number.MAX_SAFE_INTEGER,
      eventOrdinal: "7",
    },
  ]);
  expect(visible.queues[0]).toMatchObject({ occupancy: 0, tokens: [] });
  expect(visible.tileResidencies[0]).toMatchObject({
    tileId: "tile.output",
    version: "0",
    storageNodeId: "sram.tile",
    allocationEpoch: "0",
    bank: 0,
    row: 2,
    slot: 2,
    address: "4096",
  });

  const active = await seekToCycle(reader, "core", "3");
  expect(active.computations[0]).toMatchObject({
    tokenId: "inst.0",
    status: "active",
  });
  const complete = await seekToCycle(reader, "core", "4");
  expect(complete.computations[0]).toMatchObject({
    tokenId: "inst.0",
    status: "completed",
    completionCycle: "4",
  });
  await reader.close();
});

test("seek validates explicit multi-domain targets", async () => {
  const reader = await TraceBundleReader.open({
    kind: "node-directory",
    path: fixture,
  });
  await expect(
    seekToTargets(reader, [{ timeDomain: "missing", cycle: "0" }]),
  ).rejects.toMatchObject({ code: "unknown_time_domain" });
  await expect(seekToCycle(reader, "core", "6")).rejects.toMatchObject({
    code: "target_out_of_range",
  });
  await reader.close();
});
