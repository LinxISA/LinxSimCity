import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import { afterEach, expect, test } from "vitest";

import { TraceBundleReader } from "./open-bundle.js";
import type { HttpDirectorySource } from "./types.js";

const root = resolve(import.meta.dirname, "../../../..");
const fixture = join(root, "fixtures/current/minimal.bundle");
const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

test("reads the current directory bundle without losing DecimalU64 values", async () => {
  const reader = await TraceBundleReader.open({
    kind: "node-directory",
    path: fixture,
  });
  const [manifest, topology, index] = await Promise.all([
    reader.readManifest(),
    reader.readTopology(),
    reader.readIndex(),
  ]);
  expect(manifest.schema).toBe("linxsimcity.trace");
  expect(topology.schema).toBe("linxsimcity.topology");
  expect(index.chunks[0]?.firstCycle).toBe("0");
  const events = await reader.readChunk(index.chunks[0]!);
  expect(events).toHaveLength(12);
  expect(events[0]?.cycle).toBe("0");
  expect(await reader.readCheckpoint(index.checkpoints[0]!)).toMatchObject({
    cycle: "0",
    eventOrdinal: "0",
  });
  await reader.close();
});

function fixtureFetch(calls: string[], transparent = false): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (!(init?.signal instanceof AbortSignal))
      throw new Error("missing signal");
    const prefix = "/trace/";
    try {
      const bytes = await readFile(
        join(fixture, url.pathname.slice(prefix.length)),
      );
      const body =
        transparent && url.pathname.endsWith(".gz") ? gunzipSync(bytes) : bytes;
      return new Response(new Uint8Array(body), { status: 200 });
    } catch {
      return new Response("missing", { status: 404 });
    }
  };
}

function http(fetcher: typeof fetch): HttpDirectorySource {
  return {
    kind: "http-directory",
    baseUrl: "https://example.test/trace",
    fetch: fetcher,
  };
}

test("HTTP directory lazily reads gzip and server-decoded entries", async () => {
  for (const transparent of [false, true]) {
    const calls: string[] = [];
    const reader = await TraceBundleReader.open(
      http(fixtureFetch(calls, transparent)),
    );
    expect(calls.sort()).toEqual([
      "/trace/index.json",
      "/trace/manifest.json",
      "/trace/topology.json",
    ]);
    const index = await reader.readIndex();
    await expect(reader.readChunk(index.chunks[0]!)).resolves.toHaveLength(12);
    await expect(
      reader.readCheckpoint(index.checkpoints[0]!),
    ).resolves.toMatchObject({ runId: "synthetic.queue-tile-compute" });
    await reader.close();
  }
});

test("rejects legacy source kinds and strings.json API", async () => {
  await expect(
    TraceBundleReader.open({
      kind: "node-file",
      path: "old.linxtrace",
    } as never),
  ).rejects.toMatchObject({ code: "unsupported_source" });
  const reader = await TraceBundleReader.open({
    kind: "node-directory",
    path: fixture,
  });
  expect("readStrings" in reader).toBe(false);
  await reader.close();
});

test("rejects metadata binding and compressed integrity mismatches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "linx-bundle-"));
  temporary.push(directory);
  await cp(fixture, directory, { recursive: true });
  const manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  ) as { runId: string };
  manifest.runId = "wrong";
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  await expect(
    TraceBundleReader.open({ kind: "node-directory", path: directory }),
  ).rejects.toThrow(/bindings/i);

  await cp(fixture, directory, { recursive: true, force: true });
  const reader = await TraceBundleReader.open({
    kind: "node-directory",
    path: directory,
  });
  const index = await reader.readIndex();
  const path = join(directory, index.chunks[0]!.path);
  const bytes = await readFile(path);
  bytes[10] = bytes[10]! ^ 1;
  await writeFile(path, bytes);
  await expect(reader.readChunk(index.chunks[0]!)).rejects.toMatchObject({
    code: "integrity_mismatch",
  });
  await reader.close();
});

test("rejects forged index entries, aborts reads, and closes cache", async () => {
  const reader = await TraceBundleReader.open({
    kind: "node-directory",
    path: fixture,
  });
  const index = await reader.readIndex();
  await expect(
    reader.readChunk({ ...index.chunks[0]!, lastCycle: "4" }),
  ).rejects.toThrow(/not bound/i);
  const controller = new AbortController();
  controller.abort();
  await expect(
    reader.readChunk(index.chunks[0]!, controller.signal),
  ).rejects.toHaveProperty("name", "AbortError");
  const first = await reader.readChunk(index.chunks[0]!);
  const second = await reader.readChunk(index.chunks[0]!);
  expect(second).toBe(first);
  await reader.close();
  await expect(reader.readManifest()).rejects.toThrow(/closed/i);
});
