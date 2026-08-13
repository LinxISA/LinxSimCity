// @vitest-environment jsdom

import type { WorkerDiagnostic } from "@linxsimcity/trace-runtime";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useTraceLoader } from "./use-trace-loader.js";

const storeState = vi.hoisted(() => ({
  status: "empty" as const,
  diagnostic: undefined as WorkerDiagnostic | undefined,
  loadTrace: vi.fn(async () => true),
  play: vi.fn(),
  unload: vi.fn(async () => {}),
}));

vi.mock("../player/player-store.js", () => ({
  usePlayerStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

beforeEach(() => {
  storeState.status = "empty";
  storeState.diagnostic = undefined;
  storeState.loadTrace.mockReset().mockResolvedValue(true);
  storeState.play.mockReset();
  storeState.unload.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("starting the default trace loads it and begins playback", async () => {
  const { result } = renderHook(() => useTraceLoader());

  await act(async () => {
    expect(await result.current.startDefaultTrace()).toBe(true);
  });

  expect(storeState.loadTrace).toHaveBeenCalledTimes(1);
  expect(storeState.loadTrace.mock.calls[0]?.[0]).toEqual({
    kind: "http-directory",
    baseUrl: expect.stringMatching(/\/traces\/supernpubench-fa-250-blocks\/$/),
  });
  expect(storeState.play).toHaveBeenCalledTimes(1);
});

test("selecting a local file cancels a pending default trace", async () => {
  const pendingLoad = deferred<boolean>();
  storeState.loadTrace.mockImplementationOnce(async () => pendingLoad.promise);
  const { result } = renderHook(() => useTraceLoader());

  let defaultLoad!: Promise<boolean>;
  act(() => {
    defaultLoad = result.current.startDefaultTrace();
  });
  const localFile = new File(["local"], "local.linxtrace");
  await act(async () => {
    expect(await result.current.loadFile(localFile)).toBe(true);
  });
  pendingLoad.resolve(true);
  expect(await defaultLoad).toBe(false);

  expect(storeState.loadTrace).toHaveBeenCalledTimes(2);
  expect(storeState.loadTrace).toHaveBeenNthCalledWith(2, localFile);
  expect(storeState.play).not.toHaveBeenCalled();
});

test("unmounting cancels a pending default trace before a remount loads local data", async () => {
  const pendingLoad = deferred<boolean>();
  storeState.loadTrace.mockImplementationOnce(async () => pendingLoad.promise);
  const first = renderHook(() => useTraceLoader());

  let staleDefaultLoad!: Promise<boolean>;
  act(() => {
    staleDefaultLoad = first.result.current.startDefaultTrace();
  });
  first.unmount();

  const second = renderHook(() => useTraceLoader());
  const localFile = new File(["local"], "local.linxtrace");
  await act(async () => {
    expect(await second.result.current.loadFile(localFile)).toBe(true);
  });
  pendingLoad.resolve(true);
  expect(await staleDefaultLoad).toBe(false);

  expect(storeState.loadTrace).toHaveBeenCalledTimes(2);
  expect(storeState.loadTrace).toHaveBeenNthCalledWith(2, localFile);
  expect(storeState.play).not.toHaveBeenCalled();
});

test("StrictMode effect replay shares one default trace request", async () => {
  const pendingLoad = deferred<boolean>();
  const effectSetup = vi.fn();
  storeState.loadTrace.mockImplementationOnce(async () => pendingLoad.promise);

  renderHook(
    () => {
      const loader = useTraceLoader();
      useEffect(() => {
        effectSetup();
        void loader.startDefaultTrace();
      }, [loader.startDefaultTrace]);
      return loader;
    },
    { reactStrictMode: true },
  );

  await act(async () => {});
  expect(effectSetup).toHaveBeenCalledTimes(2);
  expect(storeState.loadTrace).toHaveBeenCalledTimes(1);
  pendingLoad.resolve(true);
  await waitFor(() => expect(storeState.play).toHaveBeenCalledTimes(1));
  expect(storeState.loadTrace).toHaveBeenCalledTimes(1);
});

test("a default worker error is visible and retry reloads the demo", async () => {
  let attempt = 0;
  storeState.loadTrace.mockImplementation(async () => {
    attempt += 1;
    return attempt > 1;
  });
  const { result } = renderHook(() => useTraceLoader());

  await act(async () => {
    expect(await result.current.startDefaultTrace()).toBe(false);
  });
  await waitFor(() => expect(result.current.diagnostic).toBeDefined());

  await act(async () => {
    await result.current.retryLoad();
  });
  expect(storeState.unload).toHaveBeenCalledTimes(1);
  expect(storeState.loadTrace).toHaveBeenCalledTimes(2);
  expect(storeState.play).toHaveBeenCalledTimes(1);
});

test("retry reloads the demo after a playback worker error", async () => {
  storeState.diagnostic = {
    code: "runtime_error",
    message: "playback failed",
    fatal: true,
  };
  const { result } = renderHook(() => useTraceLoader());

  await act(async () => {
    await result.current.retryLoad();
  });

  expect(storeState.unload).toHaveBeenCalledTimes(1);
  expect(storeState.loadTrace).toHaveBeenCalledTimes(1);
  expect(storeState.play).toHaveBeenCalledTimes(1);
});
