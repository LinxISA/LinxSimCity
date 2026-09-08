import { expect, test } from "vitest";

import { initialSnapshot } from "../reducer/state.js";
import { serializeSimTraceSnapshot } from "./trace-worker.js";

const topology = {
  schema: "linxsimcity.topology",
  schemaVersion: "1",
  id: "worker.test",
  name: "Worker test",
  revision: "test",
  nodes: [],
  edges: [],
} as const;

test("serializes a pure structured-clone-safe current snapshot", () => {
  const snapshot = initialSnapshot(topology, ["core"]);
  const serialized = serializeSimTraceSnapshot(snapshot);
  expect(serialized).toEqual(snapshot);
  expect(serialized).not.toBe(snapshot);
  expect(serialized.positions[0]).toMatchObject({
    timeDomain: "core",
    cycle: "0",
    eventOrdinal: "0",
  });
  expect(() => structuredClone(serialized)).not.toThrow();
});
