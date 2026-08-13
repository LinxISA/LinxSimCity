// @vitest-environment jsdom

import { expect, test } from "vitest";

import {
  createDefaultTraceController,
  resolveDefaultTraceUrl,
} from "./default-trace.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function okResponse(): Response {
  return new Response("zip", {
    status: 200,
    headers: { "content-type": "application/zip" },
  });
}

test("resolves the default archive below the active viewer base", () => {
  expect(resolveDefaultTraceUrl("/")).toBe(
    "/traces/supernpubench-fa-250-blocks.linxtrace",
  );
  expect(resolveDefaultTraceUrl("/LinxSimCity/")).toBe(
    "/LinxSimCity/traces/supernpubench-fa-250-blocks.linxtrace",
  );
  expect(resolveDefaultTraceUrl("/preview")).toBe(
    "/preview/traces/supernpubench-fa-250-blocks.linxtrace",
  );
});

test("duplicate starts share one load and begin playback once", async () => {
  let fetchCount = 0;
  let loadCount = 0;
  let playCount = 0;
  const controller = createDefaultTraceController({
    baseUrl: "/LinxSimCity/",
    fetchTrace: async (input) => {
      fetchCount += 1;
      expect(input).toBe(
        "/LinxSimCity/traces/supernpubench-fa-250-blocks.linxtrace",
      );
      return okResponse();
    },
    loadTrace: async (file) => {
      loadCount += 1;
      expect(file.name).toBe("supernpubench-fa-250-blocks.linxtrace");
      return true;
    },
    play: () => {
      playCount += 1;
    },
    onFailure: () => {
      throw new Error("unexpected default trace failure");
    },
  });

  expect(await Promise.all([controller.start(), controller.start()])).toEqual([
    true,
    true,
  ]);
  expect({ fetchCount, loadCount, playCount }).toEqual({
    fetchCount: 1,
    loadCount: 1,
    playCount: 1,
  });
});

test("cancelling a pending default fetch prevents it from replacing a local trace", async () => {
  const response = deferred<Response>();
  let loadCount = 0;
  let playCount = 0;
  const controller = createDefaultTraceController({
    baseUrl: "/",
    fetchTrace: async () => response.promise,
    loadTrace: async () => {
      loadCount += 1;
      return true;
    },
    play: () => {
      playCount += 1;
    },
    onFailure: () => {
      throw new Error("a cancellation is not a failure");
    },
  });

  const pending = controller.start();
  controller.cancel();
  response.resolve(okResponse());

  expect(await pending).toBe(false);
  expect({ loadCount, playCount }).toEqual({ loadCount: 0, playCount: 0 });
});

test("a failed request does not play and retry starts a fresh request", async () => {
  let attempt = 0;
  const failures: unknown[] = [];
  let playCount = 0;
  const controller = createDefaultTraceController({
    baseUrl: "/",
    fetchTrace: async () => {
      attempt += 1;
      return attempt === 1
        ? new Response("unavailable", { status: 503 })
        : okResponse();
    },
    loadTrace: async () => true,
    play: () => {
      playCount += 1;
    },
    onFailure: (error) => failures.push(error),
  });

  expect(await controller.start()).toBe(false);
  expect(playCount).toBe(0);
  expect(failures[0]).toBeInstanceOf(Error);
  expect((failures[0] as Error).message).toMatch(/503/);

  expect(await controller.retry()).toBe(true);
  expect({ attempt, playCount, failureCount: failures.length }).toEqual({
    attempt: 2,
    playCount: 1,
    failureCount: 1,
  });
});

test("a worker load failure is reported without starting playback", async () => {
  let failureCount = 0;
  let playCount = 0;
  const controller = createDefaultTraceController({
    baseUrl: "/",
    fetchTrace: async () => okResponse(),
    loadTrace: async () => false,
    play: () => {
      playCount += 1;
    },
    onFailure: () => {
      failureCount += 1;
    },
  });

  expect(await controller.start()).toBe(false);
  expect({ failureCount, playCount }).toEqual({
    failureCount: 1,
    playCount: 0,
  });
});
