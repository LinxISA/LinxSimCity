import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

import { afterEach, expect, test } from "vitest";

import { validateTraceBundle } from "../../tools/simtrace/src/bundle.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const buildDirectory = join(repositoryRoot, "build/sdk");
const writerPath = join(buildDirectory, "write_synthetic");
const cliPath = join(repositoryRoot, "tools/simtrace/src/main.ts");
const tsxPath = join(repositoryRoot, "node_modules/tsx/dist/cli.mjs");
const temporaryDirectories: string[] = [];

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status})\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("C++ writer output satisfies the current TypeScript bundle contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "linxsimcity-current-contract-"));
  temporaryDirectories.push(root);
  const directory = join(root, "synthetic.trace-dir");

  run("cmake", ["-S", "sdk/cpp", "-B", "build/sdk", "-DBUILD_TESTING=ON"]);
  run("cmake", ["--build", "build/sdk", "--target", "write_synthetic"]);
  run(writerPath, [directory]);

  const validation = validateTraceBundle(directory);
  expect(validation.diagnostics).toEqual([]);
  expect(validation.manifest).toMatchObject({
    schema: "linxsimcity.trace",
    schemaVersion: "1",
    runId: "synthetic.queue-flow",
    eventCount: "4",
    capabilities: ["queue-lifecycle"],
  });
  expect(validation.index.chunks).toHaveLength(1);
  expect(validation.index.checkpoints).toHaveLength(1);
  expect(validation.events.map((event) => event.type)).toEqual([
    "queue.write-attempt",
    "queue.accept",
    "queue.visible",
    "queue.read",
  ]);
  expect(
    validation.events.every((event) => typeof event.cycle === "string"),
  ).toBe(true);

  const cli = run(process.execPath, [tsxPath, cliPath, "validate", directory]);
  expect(JSON.parse(cli.stdout)).toMatchObject({
    valid: true,
    runId: "synthetic.queue-flow",
    events: 4,
    chunks: 1,
    checkpoints: 1,
    diagnostics: [],
  });

  const [index, chunkBytes] = await Promise.all([
    readFile(join(directory, "index.json"), "utf8").then(JSON.parse),
    readFile(join(directory, validation.index.chunks[0]!.path)),
  ]);
  const eventDocuments = gunzipSync(chunkBytes)
    .toString("utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(index.chunks[0]).toMatchObject({
    firstCycle: "0",
    lastCycle: "2",
    eventCount: "4",
  });
  expect(eventDocuments[0]).toMatchObject({
    timeDomain: "core",
    cycle: "0",
    phase: "work",
    sequence: 0,
    type: "queue.write-attempt",
    entityId: "queue.issue",
  });
}, 30_000);

test("the current CLI rejects a legacy viewer bundle", () => {
  const result = spawnSync(
    process.execPath,
    [
      tsxPath,
      cliPath,
      "validate",
      join(repositoryRoot, "fixtures/synthetic/minimal.trace-dir"),
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/schema|current|invalid/i);
});
