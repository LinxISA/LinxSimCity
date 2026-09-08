import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { validateTraceBundle } from "./bundle.js";

const fixture = new URL(
  "../../../fixtures/current/minimal.bundle/",
  import.meta.url,
);
const temporaryDirectories: string[] = [];

function copyFixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "linxsimcity-trace-bundle-"));
  temporaryDirectories.push(directory);
  cpSync(fixture, directory, { recursive: true });
  return directory;
}

function changeIndex(
  directory: string,
  mutate: (index: Record<string, unknown>) => void,
): void {
  const path = join(directory, "index.json");
  const index = JSON.parse(readFileSync(path, "utf8")) as Record<
    string,
    unknown
  >;
  mutate(index);
  writeFileSync(path, `${JSON.stringify(index, null, 2)}\n`);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("trace bundle reader", () => {
  test("validates compressed chunks, checkpoints, bindings, and semantics", () => {
    const result = validateTraceBundle(new URL(fixture).pathname);
    expect(result.diagnostics).toEqual([]);
    expect(result.events).toHaveLength(12);
    expect(result.checkpoints).toHaveLength(1);
  });

  test("reports a corrupted compressed file hash", () => {
    const directory = copyFixture();
    changeIndex(directory, (index) => {
      const chunks = index.chunks as { sha256: string }[];
      chunks[0]!.sha256 = "f".repeat(64);
    });
    expect(validateTraceBundle(directory).diagnostics).toContainEqual(
      expect.objectContaining({ code: "bundle_hash" }),
    );
  });

  test("reports manifest and checkpoint binding mismatches", () => {
    const directory = copyFixture();
    changeIndex(directory, (index) => {
      index.runId = "different-run";
      const checkpoints = index.checkpoints as { eventOrdinal: string }[];
      checkpoints[0]!.eventOrdinal = "1";
    });
    const codes = validateTraceBundle(directory).diagnostics.map(
      (item) => item.code,
    );
    expect(codes).toContain("bundle_binding");
    expect(codes).toContain("checkpoint_binding");
  });

  test("reports indexed chunk order changes", () => {
    const directory = copyFixture();
    cpSync(
      join(directory, "chunks/core-000.jsonl.gz"),
      join(directory, "chunks/core-001.jsonl.gz"),
    );
    changeIndex(directory, (index) => {
      const chunks = index.chunks as Record<string, unknown>[];
      const original = chunks[0]!;
      chunks.push({
        ...original,
        id: "core-001",
        path: "chunks/core-001.jsonl.gz",
        firstCycle: "0",
        lastCycle: "5",
      });
      const manifestPath = join(directory, "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        eventCount: string;
      };
      manifest.eventCount = "24";
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    });
    expect(validateTraceBundle(directory).diagnostics).toContainEqual(
      expect.objectContaining({ code: "chunk_order" }),
    );
  });

  test("rejects paths that escape the bundle directory", () => {
    const directory = copyFixture();
    changeIndex(directory, (index) => {
      const chunks = index.chunks as { path: string }[];
      chunks[0]!.path = "../outside.jsonl.gz";
    });
    expect(() => validateTraceBundle(directory)).toThrow(/escapes/);
  });
});
