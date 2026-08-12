import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

import { afterEach, expect, test } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const buildDirectory = join(repositoryRoot, "build/sdk");
const writerPath = join(buildDirectory, "write_synthetic");
const cliPath = join(repositoryRoot, "tools/linxtrace/src/main.ts");
const tsxPath = join(repositoryRoot, "node_modules/tsx/dist/cli.mjs");
const expectedPath = join(
  repositoryRoot,
  "fixtures/synthetic/minimal.expected.json",
);

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

test("C++ writer output validates identically as a directory and ZIP", async () => {
  const root = await mkdtemp(join(tmpdir(), "linxsimcity-contract-"));
  temporaryDirectories.push(root);
  const directory = join(root, "synthetic.trace-dir");
  const archive = join(root, "synthetic.linxtrace");

  run("cmake", ["-S", "sdk/cpp", "-B", "build/sdk", "-DBUILD_TESTING=ON"]);
  run("cmake", ["--build", "build/sdk", "--target", "write_synthetic"]);
  run(writerPath, [directory]);

  const directoryValidation = run(process.execPath, [
    tsxPath,
    cliPath,
    "validate",
    directory,
    "--json",
  ]);
  run(process.execPath, [tsxPath, cliPath, "pack", directory, archive]);
  const archiveValidation = run(process.execPath, [
    tsxPath,
    cliPath,
    "validate",
    archive,
    "--json",
  ]);

  expect(JSON.parse(archiveValidation.stdout)).toEqual(
    JSON.parse(directoryValidation.stdout),
  );

  const [manifest, topology, expected, chunk] = await Promise.all([
    readFile(join(directory, "manifest.json"), "utf8").then(JSON.parse),
    readFile(join(directory, "topology.json"), "utf8").then(JSON.parse),
    readFile(expectedPath, "utf8").then(JSON.parse),
    readFile(join(directory, "chunks/000000.jsonl.gz")),
  ]);
  const events = gunzipSync(chunk)
    .toString("utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect({
    eventCount: manifest.eventCount,
    eventTypes: [...new Set(events.map(({ type }) => type))].toSorted(),
    topologyIds: topology.entities
      .map(({ id }: { id: string }) => id)
      .toSorted(),
  }).toEqual(expected);
  expect(
    events
      .filter(({ cycle, type }) => cycle === 120 && type === "cell.read")
      .map(({ entity_id }) => entity_id),
  ).toEqual([
    "pe0.bg.bank0.row0",
    "pe0.bg.bank1.row0",
    "pe0.bg.bank2.row0",
    "pe0.bg.bank3.row0",
  ]);
  expect(events).toContainEqual(
    expect.objectContaining({
      cycle: 120,
      type: "pipe.transfer",
      entity_id: "pipe.b-broadcast",
      payload: expect.objectContaining({
        operand: "B",
        direction: "vertical",
        gmma: true,
      }),
    }),
  );
  expect(events).toContainEqual(
    expect.objectContaining({
      cycle: 201,
      type: "rob.tail",
      entity_id: "core.scalar.rob.slot0",
      payload: expect.objectContaining({ wrap: true }),
    }),
  );
});

test("checked-in malformed fixtures each contain one documented error", () => {
  const fixtures = [
    ["missing-entity.trace-dir", "missing_entity_reference"],
    ["out-of-order.trace-dir", "event_order"],
  ] as const;

  for (const [fixture, expectedCode] of fixtures) {
    const result = spawnSync(
      process.execPath,
      [
        tsxPath,
        cliPath,
        "validate",
        join(repositoryRoot, "fixtures/malformed", fixture),
        "--json",
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).errors).toEqual([
      expect.objectContaining({ code: expectedCode }),
    ]);
  }
});
