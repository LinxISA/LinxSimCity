import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { validateRunDocument } from "./validate.js";

const run = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/current/minimal.run.json", import.meta.url),
    "utf8",
  ),
) as unknown;
const topology = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/current/minimal.topology.json", import.meta.url),
    "utf8",
  ),
) as unknown;

test("validates the current fixture against its exact topology", () => {
  const result = validateRunDocument(run, topology);
  expect(result.diagnostics).toEqual([]);
  expect(result.run.events).toHaveLength(12);
  expect(result.topology.id).toBe("synthetic.queue-tile-compute");
});

test("reports a changed topology fingerprint", () => {
  const changed = structuredClone(topology) as { revision: string };
  changed.revision = "different";
  expect(validateRunDocument(run, changed).diagnostics).toContainEqual(
    expect.objectContaining({ code: "manifest_mismatch" }),
  );
});
