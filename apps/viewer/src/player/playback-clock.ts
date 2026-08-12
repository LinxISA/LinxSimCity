import type { PlayerStore } from "./types.js";

const BASE_CYCLES_PER_SECOND = 60;

export function startPlaybackClock(store: PlayerStore): () => void {
  let frame = 0;
  let previous = performance.now();
  let accumulatedCycles = 0;

  const tick = (now: number) => {
    const elapsedSeconds = Math.max(0, now - previous) / 1_000;
    previous = now;
    const state = store.getState();
    if (state.status === "playing" && !state.seekPending) {
      accumulatedCycles += elapsedSeconds * BASE_CYCLES_PER_SECOND * state.rate;
      const wholeCycles = Math.floor(accumulatedCycles);
      if (wholeCycles > 0) {
        accumulatedCycles -= wholeCycles;
        void state.step(wholeCycles);
      }
    } else if (state.status !== "playing") {
      accumulatedCycles = 0;
    }
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
