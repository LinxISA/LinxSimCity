import { useEffect } from "react";

export interface CityControlActions {
  readonly playing: boolean;
  readonly followCommit: boolean;
  play(): void;
  pause(): void;
  step(delta: number): void;
  selectPe(pe: 0 | 1 | 2 | 3): void;
  setFollowCommit(enabled: boolean): void;
  clearPinnedInstruction(): void;
}

export interface CameraNudge {
  readonly x: number;
  readonly z: number;
}

export const CAMERA_NUDGE_EVENT = "linxsimcity:camera-nudge";

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.matches("input, select, textarea, [contenteditable='true']")
  );
}

export function handleCityKey(
  event: KeyboardEvent,
  actions: CityControlActions,
): void {
  if (isEditable(event.target)) return;
  if (event.key >= "1" && event.key <= "4") {
    event.preventDefault();
    actions.selectPe((Number(event.key) - 1) as 0 | 1 | 2 | 3);
    return;
  }
  if (event.key === " ") {
    event.preventDefault();
    (actions.playing ? actions.pause : actions.play)();
    return;
  }
  if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    actions.setFollowCommit(!actions.followCommit);
    return;
  }
  if (event.key === "Escape") {
    actions.clearPinnedInstruction();
    return;
  }
  if (event.key.startsWith("Arrow")) {
    event.preventDefault();
    if (event.shiftKey) {
      actions.step(
        event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1,
      );
      return;
    }
    const nudge: CameraNudge = {
      x: event.key === "ArrowLeft" ? -3 : event.key === "ArrowRight" ? 3 : 0,
      z: event.key === "ArrowUp" ? -3 : event.key === "ArrowDown" ? 3 : 0,
    };
    window.dispatchEvent(
      new CustomEvent<CameraNudge>(CAMERA_NUDGE_EVENT, { detail: nudge }),
    );
  }
}

export function useCityControls(actions: CityControlActions): void {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleCityKey(event, actions);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [actions]);
}
