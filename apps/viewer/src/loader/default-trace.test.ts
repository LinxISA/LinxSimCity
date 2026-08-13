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

test("resolves the default logical bundle below the active viewer base", () => {
  expect(resolveDefaultTraceUrl("/")).toBe(
    "/traces/supernpubench-fa-250-blocks/",
  );
  expect(resolveDefaultTraceUrl("/LinxSimCity/")).toBe(
    "/LinxSimCity/traces/supernpubench-fa-250-blocks/",
  );
  expect(resolveDefaultTraceUrl("/preview")).toBe(
    "/preview/traces/supernpubench-fa-250-blocks/",
  );
});

test("duplicate starts share one logical load and begin playback once", async () => {
  let loadCount = 0;
  let playCount = 0;
  const controller = createDefaultTraceController({
    baseUrl: "/LinxSimCity/",
    pageUrl: "https://linxisa.github.io/LinxSimCity/",
    loadTrace: async (source) => {
      loadCount += 1;
      expect(source).toEqual({
        kind: "http-directory",
        baseUrl:
          "https://linxisa.github.io/LinxSimCity/traces/supernpubench-fa-250-blocks/",
      });
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
  expect({ loadCount, playCount }).toEqual({
    loadCount: 1,
    playCount: 1,
  });
});

test("cancelling a pending logical load prevents it from starting playback", async () => {
  const loaded = deferred<boolean>();
  let playCount = 0;
  const controller = createDefaultTraceController({
    baseUrl: "/",
    pageUrl: "http://localhost/",
    loadTrace: async () => loaded.promise,
    play: () => {
      playCount += 1;
    },
    onFailure: () => {
      throw new Error("a cancellation is not a failure");
    },
  });

  const pending = controller.start();
  controller.cancel();
  loaded.resolve(true);

  expect(await pending).toBe(false);
  expect(playCount).toBe(0);
});

test("a worker load failure does not play and retry starts a fresh load", async () => {
  let attempt = 0;
  let failureCount = 0;
  let playCount = 0;
  const controller = createDefaultTraceController({
    baseUrl: "/",
    pageUrl: "http://localhost/",
    loadTrace: async () => {
      attempt += 1;
      return attempt > 1;
    },
    play: () => {
      playCount += 1;
    },
    onFailure: () => {
      failureCount += 1;
    },
  });

  expect(await controller.start()).toBe(false);
  expect(playCount).toBe(0);
  expect(failureCount).toBe(1);
  expect(await controller.retry()).toBe(true);
  expect({ attempt, playCount, failureCount }).toEqual({
    attempt: 2,
    playCount: 1,
    failureCount: 1,
  });
});
