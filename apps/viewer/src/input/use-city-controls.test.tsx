// @vitest-environment jsdom

import { fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import {
  CAMERA_NUDGE_EVENT,
  handleCityKey,
  type CameraNudge,
  type CityControlActions,
} from "./use-city-controls.js";

function actions(): CityControlActions {
  return {
    playing: false,
    followCommit: false,
    play: vi.fn(),
    pause: vi.fn(),
    step: vi.fn(),
    selectPe: vi.fn(),
    setFollowCommit: vi.fn(),
    clearPinnedInstruction: vi.fn(),
  };
}

test("maps playback, PE selection, follow, step, and camera keys", () => {
  const calls = actions();
  let nudge: CameraNudge | undefined;
  window.addEventListener(
    CAMERA_NUDGE_EVENT,
    (event) => {
      nudge = (event as CustomEvent<CameraNudge>).detail;
    },
    { once: true },
  );
  handleCityKey(new KeyboardEvent("keydown", { key: " " }), calls);
  handleCityKey(new KeyboardEvent("keydown", { key: "3" }), calls);
  handleCityKey(new KeyboardEvent("keydown", { key: "F" }), calls);
  handleCityKey(
    new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true }),
    calls,
  );
  handleCityKey(new KeyboardEvent("keydown", { key: "ArrowUp" }), calls);
  handleCityKey(new KeyboardEvent("keydown", { key: "Escape" }), calls);
  expect(calls.play).toHaveBeenCalledOnce();
  expect(calls.selectPe).toHaveBeenCalledWith(2);
  expect(calls.setFollowCommit).toHaveBeenCalledWith(true);
  expect(calls.step).toHaveBeenCalledWith(1);
  expect(nudge).toEqual({ x: 0, z: -3 });
  expect(calls.clearPinnedInstruction).toHaveBeenCalledOnce();
});

test("ignores shortcuts while typing", () => {
  const calls = actions();
  const input = document.createElement("input");
  document.body.append(input);
  fireEvent.keyDown(input, { key: " " });
  handleCityKey(
    new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    calls,
  );
  expect(calls.play).toHaveBeenCalledOnce();
  const direct = new KeyboardEvent("keydown", { key: " ", bubbles: true });
  input.addEventListener("keydown", (event) => handleCityKey(event, calls), {
    once: true,
  });
  input.dispatchEvent(direct);
  expect(calls.play).toHaveBeenCalledOnce();
  input.remove();
});
