import { resolve } from "node:path";

import { expect, test } from "vitest";

import { TraceWorkerClient } from "./client.js";
import { SeekSupersededError } from "./errors.js";
import { TraceWorkerService } from "./trace-worker.js";

const fixture = resolve(
  import.meta.dirname,
  "../../../../fixtures/synthetic/minimal.trace-dir",
);

function client(): TraceWorkerClient {
  return TraceWorkerClient.inProcess(new TraceWorkerService());
}

test("worker loads, seeks, and queries a trace", async () => {
  const trace = client();
  const info = await trace.load({ kind: "node-directory", path: fixture });
  expect(info.manifest.eventCount).toBe(267);
  expect(info.topology.entities.length).toBeGreaterThan(40);

  const snapshot = await trace.seek(44, 1);
  expect(snapshot.cycle).toBe(44);
  expect(snapshot.entities[0]?.[0]).toBeDefined();
  expect(snapshot.entities.length).toBeLessThan(info.topology.entities.length);
  expect(() => structuredClone(snapshot)).not.toThrow();
  expect(await trace.eventsAt(44)).toHaveLength(1);
  expect((await trace.entityHistory("pe0.bg.bank0.row0", 0, 255)).length).toBe(
    21,
  );
  await trace.close();
});

test("a newer seek supersedes an older request", async () => {
  const trace = client();
  await trace.load({ kind: "node-directory", path: fixture });
  const older = trace.seek(255, 1);
  const newer = trace.seek(2, 2);
  await expect(older).rejects.toBeInstanceOf(SeekSupersededError);
  await expect(newer).resolves.toMatchObject({ cycle: 2 });
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
