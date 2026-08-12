import { resolve } from "node:path";

import { expect, test } from "vitest";

import { TraceBundleReader } from "../bundle/open-bundle.js";
import { reduceEvent } from "./reduce-event.js";
import { seekToCycle } from "./seek.js";
import { initialSnapshot, snapshotToObject } from "./state.js";

const fixture = resolve(
  import.meta.dirname,
  "../../../../fixtures/synthetic/minimal.trace-dir",
);

test("checkpoint seek matches linear replay for every synthetic cycle", async () => {
  const reader = await TraceBundleReader.open({
    kind: "node-directory",
    path: fixture,
  });
  const [topology, index] = await Promise.all([
    reader.readTopology(),
    reader.readIndex(),
  ]);
  const events = (
    await Promise.all(index.chunks.map((chunk) => reader.readChunk(chunk)))
  ).flat();
  let linear = initialSnapshot(topology);
  for (let cycle = 0; cycle <= 255; cycle++) {
    for (const event of events.filter(
      (candidate) => candidate.cycle === cycle,
    )) {
      linear = reduceEvent(linear, event);
    }
    expect(snapshotToObject(await seekToCycle(reader, cycle))).toEqual(
      snapshotToObject(linear),
    );
  }
  await reader.close();
});

test("seek rejects a cycle outside manifest bounds", async () => {
  const reader = await TraceBundleReader.open({
    kind: "node-directory",
    path: fixture,
  });
  await expect(seekToCycle(reader, 256)).rejects.toMatchObject({
    code: "cycle_out_of_range",
  });
  await reader.close();
});
