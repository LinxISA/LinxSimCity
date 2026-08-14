import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

import { afterAll, beforeAll, expect, test, vi } from "vitest";

import { MAX_METADATA_BYTES, TraceBundleReader } from "./open-bundle.js";
import type { HttpDirectorySource } from "./types.js";

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

test("runtime accepts the generated physical topology metadata size", () => {
  expect(MAX_METADATA_BYTES).toBeGreaterThanOrEqual(32 * 1024 * 1024);
});

test("reader rejects traversal entries before opening data", async () => {
  await expect(
    TraceBundleReader.open({
      kind: "node-directory",
      path: join(root, "fixtures/synthetic/minimal.trace-dir/.."),
    }),
  ).rejects.toThrow(/trace bundle|required/i);
});

interface FetchCall {
  url: string;
  signal: AbortSignal | null;
  cache: RequestCache | undefined;
}

function fixtureFetch(calls: FetchCall[]): typeof fetch {
  return async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    calls.push({
      url: url.href,
      signal: init?.signal ?? null,
      cache: init?.cache,
    });
    const prefix = "/traces/fa-detail/";
    if (!url.pathname.startsWith(prefix)) {
      return new Response("outside logical bundle", { status: 404 });
    }
    const path = url.pathname.slice(prefix.length);
    try {
      const bytes = await readFile(join(fixture, path));
      const body = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      return new Response(body, {
        status: 200,
        headers: { "content-length": String(bytes.byteLength) },
      });
    } catch {
      return new Response("missing", { status: 404 });
    }
  };
}

function httpSource(fetchTrace: typeof fetch): HttpDirectorySource {
  return {
    kind: "http-directory",
    baseUrl: "https://example.test/traces/fa-detail",
    fetch: fetchTrace,
  };
}

test("HTTP directory opens metadata without fetching strings or trace data", async () => {
  const calls: FetchCall[] = [];
  const reader = await TraceBundleReader.open(httpSource(fixtureFetch(calls)));

  expect(calls.map(({ url }) => url).sort()).toEqual([
    "https://example.test/traces/fa-detail/index.json",
    "https://example.test/traces/fa-detail/manifest.json",
    "https://example.test/traces/fa-detail/topology.json",
  ]);
  expect(calls.every(({ signal }) => signal instanceof AbortSignal)).toBe(true);
  expect(calls.every(({ cache }) => cache === "no-cache")).toBe(true);
  await reader.readManifest();
  expect(calls).toHaveLength(3);

  const index = await reader.readIndex();
  await reader.readChunk(index.chunks[0]!);
  expect(calls.at(-1)?.url).toBe(
    "https://example.test/traces/fa-detail/chunks/000000.jsonl.gz",
  );
  await reader.close();
});

test("HTTP directory binds the WorkerGlobalScope fetch receiver", async () => {
  const calls: FetchCall[] = [];
  const fetchTrace = fixtureFetch(calls);
  const receiver = globalThis;
  vi.stubGlobal(
    "fetch",
    function (this: unknown, ...args: Parameters<typeof fetch>) {
      if (this !== receiver) throw new TypeError("Illegal invocation");
      return fetchTrace(...args);
    },
  );

  try {
    const reader = await TraceBundleReader.open({
      kind: "http-directory",
      baseUrl: "https://example.test/traces/fa-detail",
    });
    expect(await reader.readManifest()).toBeDefined();
    expect(calls).toHaveLength(3);
    await reader.close();
  } finally {
    vi.unstubAllGlobals();
  }
});

test("HTTP directory accepts trace data transparently decompressed by the server", async () => {
  const fetchTrace: typeof fetch = async (input) => {
    const url = new URL(String(input));
    const prefix = "/traces/fa-detail/";
    const path = url.pathname.slice(prefix.length);
    try {
      const bytes = await readFile(join(fixture, path));
      const body = path.endsWith(".gz") ? gunzipSync(bytes) : bytes;
      return new Response(new Uint8Array(body), { status: 200 });
    } catch {
      return new Response("missing", { status: 404 });
    }
  };
  const reader = await TraceBundleReader.open(httpSource(fetchTrace));
  const index = await reader.readIndex();

  await expect(reader.readChunk(index.chunks[0]!)).resolves.toHaveLength(
    index.chunks[0]!.eventCount,
  );
  await expect(
    reader.readCheckpoint(index.chunks[0]!.checkpointPath),
  ).resolves.toBeDefined();
  await reader.close();
});

test("HTTP directory reports a missing metadata entry", async () => {
  const fetchTrace: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("manifest.json")) {
      return new Response("missing", { status: 404 });
    }
    return fixtureFetch([])(input);
  };

  await expect(
    TraceBundleReader.open(httpSource(fetchTrace)),
  ).rejects.toMatchObject({ code: "missing_entry" });
});

test("HTTP directory rejects an oversized entry before reading its body", async () => {
  const fetchTrace: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("manifest.json")) {
      return new Response("{}", {
        status: 200,
        headers: { "content-length": String(256 * 1024 * 1024 + 1) },
      });
    }
    return fixtureFetch([])(input);
  };

  await expect(
    TraceBundleReader.open(httpSource(fetchTrace)),
  ).rejects.toMatchObject({ code: "resource_limit" });
});

test("HTTP directory rejects reads after close", async () => {
  const reader = await TraceBundleReader.open(httpSource(fixtureFetch([])));
  await reader.close();

  await expect(reader.readStrings()).rejects.toThrow(/closed/i);
});

test("reader applies manifest capabilities while parsing chunks", async () => {
  const detailedFixture = join(temporaryDirectory, "detailed.trace-dir");
  await cp(fixture, detailedFixture, { recursive: true });
  const manifest = JSON.parse(
    await readFile(join(detailedFixture, "manifest.json"), "utf8"),
  ) as Record<string, unknown>;
  manifest.capabilities = ["instruction-causality-v1"];
  await writeFile(
    join(detailedFixture, "manifest.json"),
    JSON.stringify(manifest),
  );

  const reader = await TraceBundleReader.open({
    kind: "node-directory",
    path: detailedFixture,
  });
  const index = await reader.readIndex();
  await expect(reader.readChunk(index.chunks[0]!)).rejects.toThrow(
    /invalid event at line 1/i,
  );
  await reader.close();
});
