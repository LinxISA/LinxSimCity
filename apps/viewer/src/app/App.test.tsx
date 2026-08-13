// @vitest-environment jsdom

import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { App } from "./App.js";

const loaderState = vi.hoisted(() => ({
  loadFile: vi.fn(async () => true),
  startDefaultTrace: vi.fn(async () => true),
  retryLoad: vi.fn(async () => {}),
  diagnostic: undefined as
    { code: string; message: string; fatal: boolean } | undefined,
}));

const playerState = vi.hoisted(() => ({
  status: "empty" as "empty" | "loading" | "ready" | "playing" | "error",
  info: undefined,
  snapshot: undefined as SerializedViewerSnapshot | undefined,
  cycle: 0,
  rate: 1 as const,
  mode: "demo" as const,
  seekPending: false,
  selectedEntityId: undefined,
  unload: vi.fn(async () => {}),
  seek: vi.fn(async () => {}),
  play: vi.fn(),
  pause: vi.fn(),
  step: vi.fn(async () => {}),
  setRate: vi.fn(),
  setMode: vi.fn(),
}));

vi.mock("../loader/use-trace-loader.js", () => ({
  useTraceLoader: () => loaderState,
}));
vi.mock("../player/player-store.js", () => ({
  playerStore: {},
  usePlayerStore: (selector: (state: typeof playerState) => unknown) =>
    selector(playerState),
}));
vi.mock("../player/playback-clock.js", () => ({
  startPlaybackClock: () => () => {},
}));
vi.mock("../scene/SceneViewport.js", () => ({
  SceneViewport: () => <div aria-label="3D scene" />,
}));
vi.mock("../timeline/Timeline.js", () => ({
  Timeline: () => <div aria-label="Trace navigation" />,
}));
vi.mock("../inspector/Inspector.js", () => ({
  Inspector: () => <div aria-label="Trace inspector" />,
}));

beforeEach(() => {
  loaderState.loadFile.mockReset().mockResolvedValue(true);
  loaderState.startDefaultTrace.mockReset().mockResolvedValue(true);
  loaderState.retryLoad.mockReset().mockResolvedValue(undefined);
  loaderState.diagnostic = undefined;
  playerState.status = "empty";
  playerState.snapshot = undefined;
});

afterEach(cleanup);

test("mounting the app starts the bundled demo", () => {
  render(<App />);
  expect(loaderState.startDefaultTrace).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("trace-dropzone")).toBeTruthy();
});

test("a loaded snapshot keeps the compact local picker visible", () => {
  playerState.status = "playing";
  playerState.snapshot = {
    cycle: 49,
    entities: [],
    activeEvents: [],
    changedEntityIds: [],
    profileAvailability: {
      overview: true,
      pipeline: true,
      forensic: false,
    },
  };
  render(<App />);

  expect(
    screen.getByRole("button", { name: /open local trace/i }),
  ).toBeTruthy();
  expect(screen.queryByTestId("trace-dropzone")).toBeNull();
});

test("the diagnostics retry action uses the loader retry route", async () => {
  loaderState.diagnostic = {
    code: "runtime_error",
    message: "default trace unavailable",
    fatal: true,
  };
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(loaderState.retryLoad).toHaveBeenCalledTimes(1);
});
