import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterAll, beforeAll, expect, test } from "vitest";

import { TraceBundleReader } from "./open-bundle.js";

const root = resolve(import.meta.dirname, "../../../..");
const fixture = join(root, "fixtures/synthetic/minimal.trace-dir");
let temporaryDirectory: string;
let archive: string;

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "trace-runtime-"));
  archive = join(temporaryDirectory, "minimal.linxtrace");
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "tools/linxtrace/src/main.ts",
      "pack",
      fixture,
      archive,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
});

afterAll(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test("directory and ZIP readers return equal logical data", async () => {
  const directoryReader = await TraceBundleReader.open({
    kind: "node-directory",
    path: fixture,
  });
  const zipReader = await TraceBundleReader.open({
    kind: "node-file",
    path: archive,
  });
  const [directoryManifest, zipManifest, directoryTopology, zipTopology] =
    await Promise.all([
      directoryReader.readManifest(),
      zipReader.readManifest(),
      directoryReader.readTopology(),
      zipReader.readTopology(),
    ]);
  expect(zipManifest).toEqual(directoryManifest);
  expect(zipTopology.entities).toHaveLength(directoryTopology.entities.length);

  const [directoryIndex, zipIndex] = await Promise.all([
    directoryReader.readIndex(),
    zipReader.readIndex(),
  ]);
  expect(zipIndex).toEqual(directoryIndex);
  expect(await zipReader.readChunk(zipIndex.chunks[0]!)).toEqual(
    await directoryReader.readChunk(directoryIndex.chunks[0]!),
  );
  expect(
    await zipReader.readCheckpoint(zipIndex.chunks[0]!.checkpointPath),
  ).toEqual(
    await directoryReader.readCheckpoint(
      directoryIndex.chunks[0]!.checkpointPath,
    ),
  );
  await directoryReader.close();
  await zipReader.close();
});

test("reader rejects traversal entries before opening data", async () => {
  await expect(
    TraceBundleReader.open({
      kind: "node-directory",
      path: join(root, "fixtures/synthetic/minimal.trace-dir/.."),
    }),
  ).rejects.toThrow(/trace bundle|required/i);
});
