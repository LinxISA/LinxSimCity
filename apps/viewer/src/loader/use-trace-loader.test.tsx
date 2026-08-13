// @vitest-environment jsdom

import type { WorkerDiagnostic } from "@linxsimcity/trace-runtime";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
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

function okResponse(): Response {
  return new Response(new Blob(["zip"]), { status: 200 });
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
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => okResponse()),
  );
  const { result } = renderHook(() => useTraceLoader());

  await act(async () => {
    expect(await result.current.startDefaultTrace()).toBe(true);
  });

  expect(storeState.loadTrace).toHaveBeenCalledTimes(1);
  expect(storeState.loadTrace.mock.calls[0]?.[0]).toBeInstanceOf(File);
  expect(storeState.play).toHaveBeenCalledTimes(1);
});

test("selecting a local file cancels a pending default trace", async () => {
  const pendingResponse = deferred<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => pendingResponse.promise),
  );
  const { result } = renderHook(() => useTraceLoader());

  let defaultLoad!: Promise<boolean>;
  act(() => {
    defaultLoad = result.current.startDefaultTrace();
  });
  const localFile = new File(["local"], "local.linxtrace");
  await act(async () => {
    expect(await result.current.loadFile(localFile)).toBe(true);
  });
  pendingResponse.resolve(okResponse());
  expect(await defaultLoad).toBe(false);

  expect(storeState.loadTrace).toHaveBeenCalledTimes(1);
  expect(storeState.loadTrace).toHaveBeenCalledWith(localFile);
  expect(storeState.play).not.toHaveBeenCalled();
});

test("unmounting cancels a pending default trace before a remount loads local data", async () => {
  const pendingResponse = deferred<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => pendingResponse.promise),
  );
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
  pendingResponse.resolve(okResponse());
  expect(await staleDefaultLoad).toBe(false);

  expect(storeState.loadTrace).toHaveBeenCalledTimes(1);
  expect(storeState.loadTrace).toHaveBeenCalledWith(localFile);
  expect(storeState.play).not.toHaveBeenCalled();
});

test("a default fetch error is visible and retry reloads the demo", async () => {
  let attempt = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      attempt += 1;
      return attempt === 1
        ? new Response("unavailable", { status: 503 })
        : okResponse();
    }),
  );
  const { result } = renderHook(() => useTraceLoader());

  await act(async () => {
    expect(await result.current.startDefaultTrace()).toBe(false);
  });
  await waitFor(() =>
    expect(result.current.diagnostic?.message).toMatch(/503/),
  );

  await act(async () => {
    await result.current.retryLoad();
  });
  expect(storeState.unload).toHaveBeenCalledTimes(1);
  expect(storeState.loadTrace).toHaveBeenCalledTimes(1);
  expect(storeState.play).toHaveBeenCalledTimes(1);
});
