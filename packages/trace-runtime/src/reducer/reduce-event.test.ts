import type { SimTraceEvent } from "@linxsimcity/trace-schema";
import type { ArchitectureTopology } from "@linxsimcity/world";
import { expect, test } from "vitest";

import { restoreCheckpoint, snapshotToCheckpoint } from "./checkpoint.js";
import { reduceEvents } from "./reduce-event.js";
import { initialSnapshot } from "./state.js";

const topology: ArchitectureTopology = {
  schema: "linxsimcity.topology",
  schemaVersion: "1",
  id: "reducer",
  name: "Reducer",
  revision: "test",
  nodes: [
    {
      id: "queue",
      definitionId: "core.queue",
      parameters: { capacity: 4 },
      area: { value: null, unit: "um2", status: "unknown", source: "test" },
    },
    {
      id: "sram",
      definitionId: "core.sram",
      parameters: {},
      area: { value: null, unit: "um2", status: "unknown", source: "test" },
    },
    {
      id: "compute",
      definitionId: "core.vector",
      parameters: {},
      area: { value: null, unit: "um2", status: "unknown", source: "test" },
    },
  ],
  edges: [],
};

function event(
  cycle: string,
  phase: SimTraceEvent["phase"],
  sequence: number,
  type: SimTraceEvent["type"],
  entityId: string,
  payload: Record<string, unknown>,
): SimTraceEvent {
  return {
    timeDomain: "core",
    cycle,
    phase,
    sequence,
    type,
    entityId,
    payload,
  };
}

test("reduces queue slots, backpressure, flush, and reset deterministically", () => {
  const events = [
    event("1", "work", 0, "queue.write-attempt", "queue", {
      tokenId: "t0",
      producerNodeId: "compute",
    }),
    event("1", "xfer", 0, "queue.accept", "queue", {
      tokenId: "t0",
      slot: 2,
      occupancy: 1,
      capacity: 4,
    }),
    event("1", "commit", 0, "queue.backpressure", "queue", {
      tokenId: "t0",
      occupancy: 1,
      capacity: 4,
      reason: "full",
    }),
    event("2", "work", 0, "link.associate", "queue", {
      tokenId: "t0",
      tileId: "tile",
      version: "18446744073709551615",
      relation: "produces",
    }),
    event("2", "work", 1, "compute.start", "compute", {
      tokenId: "t0",
      operation: "mac",
      inputTileIds: ["in"],
      outputTileIds: ["tile"],
    }),
    event("2", "commit", 0, "run.flush", "compute", {
      reason: "mispredict",
      tokenIds: ["t0"],
    }),
  ];
  const snapshot = reduceEvents(initialSnapshot(topology, ["core"]), events);
  expect(snapshot.queues[0]).toMatchObject({
    occupancy: 0,
    tokens: [],
    backpressure: { active: false },
  });
  expect(snapshot.associations).toEqual([]);
  expect(snapshot.computations[0]).toMatchObject({
    tokenId: "t0",
    status: "cancelled",
  });
  expect(snapshot.flushes[0]?.tokenIds).toEqual(["t0"]);

  const reset = reduceEvents(snapshot, [
    event("3", "work", 0, "run.reset", "compute", { reason: "restart" }),
  ]);
  expect(reset.computations).toEqual([]);
  expect(reset.flushes).toEqual([]);
  expect(reset.resets).toEqual([
    { timeDomain: "core", cycle: "3", reason: "restart" },
  ]);
});

test("tracks tile move, release, and allocation epoch without numeric coercion", () => {
  const allocate = event("1", "xfer", 0, "tile.allocate", "sram", {
    residencyId: "r0",
    tileId: "tile",
    version: "9007199254740993",
    storageNodeId: "sram",
    allocationEpoch: "9007199254740994",
    address: "18446744073709551615",
    byteOffset: 0,
    byteLength: 128,
    fragmentIndex: 0,
    fragmentCount: 1,
  });
  const move = event("2", "xfer", 0, "tile.move", "sram", {
    residencyId: "r0",
    toResidencyId: "r1",
    tileId: "tile",
    version: "9007199254740993",
    toStorageNodeId: "sram",
    toAllocationEpoch: "9007199254740995",
    toBank: 2,
    toRow: 7,
    toSlot: 3,
    toAddress: "18446744073709551614",
    toByteOffset: 0,
    toByteLength: 128,
    toFragmentIndex: 0,
    toFragmentCount: 1,
  });
  const moved = reduceEvents(initialSnapshot(topology, ["core"]), [
    allocate,
    move,
  ]);
  expect(moved.tileResidencies).toEqual([
    expect.objectContaining({
      residencyId: "r1",
      version: "9007199254740993",
      allocationEpoch: "9007199254740995",
      address: "18446744073709551614",
      bank: 2,
      row: 7,
      slot: 3,
    }),
  ]);
  const released = reduceEvents(moved, [
    event("3", "commit", 0, "tile.release", "sram", {
      residencyId: "r1",
      tileId: "tile",
      version: "9007199254740993",
      reason: "done",
    }),
  ]);
  expect(released.tileResidencies).toEqual([]);
});

test("tracks cross-bank copies, partial access, and address reuse", () => {
  const allocate = (
    sequence: number,
    residencyId: string,
    bank: number,
    epoch: string,
    tileId = "tile.copy",
  ) =>
    event("1", "xfer", sequence, "tile.allocate", "sram", {
      residencyId,
      tileId,
      version: "7",
      storageNodeId: "sram",
      allocationEpoch: epoch,
      bank,
      row: 4,
      slot: bank,
      address: "8192",
      byteOffset: 0,
      byteLength: 128,
      fragmentIndex: 0,
      fragmentCount: 1,
    });
  const copied = reduceEvents(initialSnapshot(topology, ["core"]), [
    allocate(0, "copy.0", 0, "1"),
    allocate(1, "copy.1", 1, "1"),
    event("1", "xfer", 2, "tile.write", "sram", {
      residencyId: "copy.1",
      tileId: "tile.copy",
      version: "7",
      tokenId: "token.write",
      byteOffset: 32,
      byteLength: 64,
    }),
  ]);
  expect(copied.tileResidencies).toHaveLength(2);
  expect(
    copied.tileResidencies.find((item) => item.residencyId === "copy.1"),
  ).toMatchObject({
    bank: 1,
    lastAccess: {
      type: "write",
      cycle: "1",
      tokenId: "token.write",
      byteOffset: 32,
      byteLength: 64,
    },
  });
  expect(
    snapshotToCheckpoint(copied, {
      runId: "copy-run",
      topologyFingerprint: "copy-topology",
      timeDomain: "core",
    }).state.tileResidencies.find((item) => item.residencyId === "copy.1"),
  ).toMatchObject({
    lastAccess: {
      type: "write",
      cycle: "1",
      byteOffset: 32,
      byteLength: 64,
    },
  });

  const reused = reduceEvents(copied, [
    event("2", "commit", 0, "tile.release", "sram", {
      residencyId: "copy.0",
      tileId: "tile.copy",
      version: "7",
      reason: "evict-copy",
    }),
    event("2", "commit", 1, "tile.allocate", "sram", {
      residencyId: "reuse.0",
      tileId: "tile.reused",
      version: "7",
      storageNodeId: "sram",
      allocationEpoch: "2",
      bank: 0,
      row: 4,
      slot: 0,
      address: "8192",
      byteOffset: 0,
      byteLength: 128,
      fragmentIndex: 0,
      fragmentCount: 1,
    }),
  ]);
  expect(reused.tileResidencies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ residencyId: "copy.1", bank: 1 }),
      expect.objectContaining({
        residencyId: "reuse.0",
        tileId: "tile.reused",
        allocationEpoch: "2",
        address: "8192",
      }),
    ]),
  );
});

test("checkpoint uses the current contract and restores architectural state", () => {
  const snapshot = reduceEvents(initialSnapshot(topology, ["core"]), [
    event("1", "xfer", 0, "queue.accept", "queue", {
      tokenId: "t0",
      slot: 0,
      occupancy: 1,
      capacity: 4,
    }),
  ]);
  const checkpoint = snapshotToCheckpoint(snapshot, {
    runId: "run",
    topologyFingerprint: "fingerprint",
    timeDomain: "core",
  });
  const restored = restoreCheckpoint(
    initialSnapshot(topology, ["core"]),
    checkpoint,
  );
  expect(checkpoint.state.queueTokens).toEqual([
    { tokenId: "t0", queueId: "queue", state: "accepted", slot: 0 },
  ]);
  expect(restored.queues).toEqual(snapshot.queues);
  expect(restored.positions[0]?.eventOrdinal).toBe("1");
});

test("rejects duplicate same-cycle phase and sequence keys", () => {
  const duplicate = event("1", "work", 0, "run.reset", "compute", {
    reason: "again",
  });
  expect(() =>
    reduceEvents(initialSnapshot(topology, ["core"]), [duplicate, duplicate]),
  ).toThrow(/duplicate event order key/);
});
