// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { Timeline } from "./Timeline.js";

afterEach(cleanup);

function renderTimeline(
  overrides: Partial<Parameters<typeof Timeline>[0]> = {},
) {
  const props: Parameters<typeof Timeline>[0] = {
    cycle: 5,
    firstCycle: 0,
    lastCycle: 10,
    status: "ready",
    rate: 1,
    seekPending: false,
    onSeek: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onStep: vi.fn(),
    onRate: vi.fn(),
    ...overrides,
  };
  render(<Timeline {...props} />);
  return props;
}

test("keyboard controls play, pause, and single-step", () => {
  const props = renderTimeline();
  fireEvent.keyDown(window, { code: "Space" });
  fireEvent.keyDown(window, { code: "ArrowLeft" });
  fireEvent.keyDown(window, { code: "ArrowRight" });
  expect(props.onPlay).toHaveBeenCalledOnce();
  expect(props.onStep).toHaveBeenNthCalledWith(1, -1);
  expect(props.onStep).toHaveBeenNthCalledWith(2, 1);

  cleanup();
  const playing = renderTimeline({ status: "playing" });
  fireEvent.keyDown(window, { code: "Space" });
  expect(playing.onPause).toHaveBeenCalledOnce();
});

test("cycle input clamps and playback rate is selectable", async () => {
  const props = renderTimeline();
  const input = screen.getByLabelText(/cycle number/i);
  await userEvent.clear(input);
  await userEvent.type(input, "99{Enter}");
  expect(props.onSeek).toHaveBeenCalledWith(10);
  await userEvent.selectOptions(screen.getByLabelText(/playback rate/i), "4");
  expect(props.onRate).toHaveBeenCalledWith(4);
});

test("pause stays available while a playback seek is pending", async () => {
  const props = renderTimeline({ status: "playing", seekPending: true });

  const pause = screen.getByRole<HTMLButtonElement>("button", {
    name: "Pause",
  });
  expect(pause.disabled).toBe(false);
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Previous cycle" })
      .disabled,
  ).toBe(true);
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Next cycle" })
      .disabled,
  ).toBe(true);
  expect(
    screen.getByLabelText<HTMLSelectElement>(/playback rate/i).disabled,
  ).toBe(true);

  await userEvent.click(pause);
  expect(props.onPause).toHaveBeenCalledOnce();
});

test("scrub input coalesces to one seek per animation frame", () => {
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  const props = renderTimeline();
  const scrubber = screen.getByLabelText(/trace timeline/i);
  fireEvent.change(scrubber, { target: { value: "7" } });
  fireEvent.change(scrubber, { target: { value: "8" } });
  expect(props.onSeek).not.toHaveBeenCalled();
  callbacks[0]?.(0);
  expect(props.onSeek).toHaveBeenCalledOnce();
  expect(props.onSeek).toHaveBeenCalledWith(8);
  vi.unstubAllGlobals();
});
