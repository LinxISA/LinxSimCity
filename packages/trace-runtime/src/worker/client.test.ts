import { resolve } from "node:path";

import { expect, test } from "vitest";

import { TraceWorkerClient } from "./client.js";
import { SeekSupersededError } from "./errors.js";
import { TraceWorkerService } from "./trace-worker.js";

const fixture = resolve(
  import.meta.dirname,
  "../../../../fixtures/current/minimal.bundle",
);

function client(): TraceWorkerClient {
  return TraceWorkerClient.inProcess(new TraceWorkerService());
}

test("worker loads, seeks, and queries the current trace", async () => {
  const trace = client();
  const info = await trace.load({ kind: "node-directory", path: fixture });
  expect(info.manifest.eventCount).toBe("12");
  expect(info.topology.nodes).toHaveLength(5);

  const snapshot = await trace.seek("core", "2", 1);
  expect(snapshot.positions[0]?.cycle).toBe("2");
  expect(snapshot.queues[0]).toMatchObject({ occupancy: 0, tokens: [] });
  expect(snapshot.tileResidencies[0]).toMatchObject({
    tileId: "tile.output",
    allocationEpoch: "0",
  });
  expect(() => structuredClone(snapshot)).not.toThrow();
  expect(await trace.eventsAt("core", "2")).toHaveLength(4);
  expect(
    (await trace.entityHistory("core", "queue.ingress", "1", "2")).map(
      (event) => event.type,
    ),
  ).toEqual([
    "queue.write-attempt",
    "queue.accept",
    "queue.visible",
    "link.associate",
    "queue.read",
  ]);
  await trace.close();
});

test("a newer seek aborts and supersedes an older request", async () => {
  const trace = client();
  await trace.load({ kind: "node-directory", path: fixture });
  const older = trace.seek("core", "5", 1);
  const newer = trace.seek("core", "2", 2);
  await expect(older).rejects.toBeInstanceOf(SeekSupersededError);
  await expect(newer).resolves.toMatchObject({
    positions: [expect.objectContaining({ cycle: "2" })],
  });
  await trace.close();
});

test("one hundred rapid seeks publish only the latest result", async () => {
  const trace = client();
  await trace.load({ kind: "node-directory", path: fixture });
  const requests = Array.from({ length: 100 }, (_, index) =>
    trace.seek("core", String(index % 6), index + 1),
  );
  const results = await Promise.allSettled(requests);
  expect(
    results.slice(0, -1).every((result) => result.status === "rejected"),
  ).toBe(true);
  expect(results.at(-1)).toMatchObject({
    status: "fulfilled",
    value: { positions: [expect.objectContaining({ cycle: "3" })] },
  });
  await trace.close();
});

test("invalid bundles propagate structured fatal diagnostics", async () => {
  const trace = client();
  await expect(
    trace.load({ kind: "node-directory", path: resolve(fixture, "..") }),
  ).rejects.toMatchObject({
    diagnostic: {
      fatal: true,
      code: "missing_entry",
    },
  });
  await trace.close();
});
