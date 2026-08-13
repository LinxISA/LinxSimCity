import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const defaultTrace = new URL(
  "../../apps/viewer/public/traces/supernpubench-fa-250-blocks.linxtrace",
  import.meta.url,
);

test("the hosted FA trace is the verified official archive", () => {
  const bytes = readFileSync(defaultTrace);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "2d2001de4b1b00e3dade9a8d4e77f5f9915f235798fbbd8b5db1074e65572fa0",
  );
});
