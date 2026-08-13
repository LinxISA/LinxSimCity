import {
  normalizeWorkerError,
  SeekSupersededError,
  TraceWorkerClient,
} from "@linxsimcity/trace-runtime";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type {
  PlaybackRate,
  PlayerState,
  PlayerStore,
  TraceWorkerFactory,
  ViewerMode,
} from "./types.js";

const initialValues = {
  status: "empty" as const,
  cycle: 0,
  rate: 1 as const,
  mode: "demo" as const,
  selectedPe: 0 as const,
  followCommit: true,
  recentCommits: [],
  seekPending: false,
  nextRequestId: 0,
};

function commitState(
  snapshot: import("@linxsimcity/trace-runtime").SerializedViewerSnapshot,
) {
  const retired = snapshot.causal.instructions
    .map(([, instruction]) => instruction)
    .filter((instruction) => instruction.retired && !instruction.squashed)
    .sort(
      (left, right) => right.lastCycle - left.lastCycle || right.id - left.id,
    );
  return { liveCommit: retired[0], recentCommits: retired.slice(0, 8) };
}

export function createPlayerStore(
  createWorker: TraceWorkerFactory = () => TraceWorkerClient.spawn(),
): PlayerStore {
  let worker: ReturnType<TraceWorkerFactory> | undefined;
  let loadGeneration = 0;
  const getWorker = () => (worker ??= createWorker());

  return createStore<PlayerState>()((set, get) => ({
    ...initialValues,

    async loadTrace(source) {
      const generation = ++loadGeneration;
      const previousWorker = worker;
      const nextWorker = createWorker();
      worker = nextWorker;
      set({
        status: "loading",
        diagnostic: undefined,
        selectedEntityId: undefined,
        seekPending: true,
      });
      try {
        if (previousWorker && previousWorker !== nextWorker) {
          await previousWorker.close();
        }
        const info = await nextWorker.load(source);
        if (generation !== loadGeneration || worker !== nextWorker) {
          return false;
        }
        const requestId = get().nextRequestId;
        set({ info, nextRequestId: requestId + 1 });
        const snapshot = await nextWorker.seek(
          info.manifest.firstCycle,
          requestId,
        );
        if (generation !== loadGeneration || worker !== nextWorker) {
          return false;
        }
        set({
          info,
          snapshot,
          ...commitState(snapshot),
          cycle: snapshot.cycle,
          status: "ready",
          seekPending: false,
        });
        return true;
      } catch (error) {
        if (generation !== loadGeneration || worker !== nextWorker) {
          return false;
        }
        set({
          status: "error",
          seekPending: false,
          diagnostic: normalizeWorkerError(error),
        });
        return false;
      }
    },

    async seek(cycle) {
      const { info } = get();
      if (!info) return;
      const target = Math.max(
        info.manifest.firstCycle,
        Math.min(info.manifest.lastCycle, Math.trunc(cycle)),
      );
      const requestId = get().nextRequestId;
      set({ seekPending: true, nextRequestId: requestId + 1 });
      try {
        const snapshot = await getWorker().seek(target, requestId);
        if (get().nextRequestId !== requestId + 1) return;
        const status = get().status === "playing" ? "playing" : "ready";
        set({
          snapshot,
          ...commitState(snapshot),
          cycle: snapshot.cycle,
          seekPending: false,
          status,
        });
      } catch (error) {
        if (error instanceof SeekSupersededError) {
          if (get().nextRequestId === requestId + 1)
            set({ seekPending: false });
          return;
        }
        set({
          status: "error",
          seekPending: false,
          diagnostic: normalizeWorkerError(error),
        });
      }
    },

    play() {
      const { info, cycle } = get();
      if (info && cycle < info.manifest.lastCycle) set({ status: "playing" });
    },

    pause() {
      if (get().info) set({ status: "ready" });
    },

    async step(delta) {
      await get().seek(get().cycle + Math.trunc(delta));
    },

    setRate(rate: PlaybackRate) {
      set({ rate });
    },

    setMode(mode: ViewerMode) {
      set({ mode });
    },

    selectEntity(entityId) {
      const peMatch = entityId
        ? /(?:^|\.)pe([0-3])(?:\.|$)/.exec(entityId)
        : undefined;
      set({
        selectedEntityId: entityId,
        ...(peMatch ? { selectedPe: Number(peMatch[1]) as 0 | 1 | 2 | 3 } : {}),
      });
    },

    selectPe(selectedPe) {
      set({ selectedPe });
    },

    setFollowCommit(followCommit) {
      set({ followCommit });
    },

    pinInstruction(pinnedInstructionId) {
      set({ pinnedInstructionId });
    },

    async unload() {
      const generation = ++loadGeneration;
      const currentWorker = worker;
      worker = undefined;
      await currentWorker?.close();
      if (generation !== loadGeneration) return;
      set({
        ...initialValues,
        info: undefined,
        snapshot: undefined,
        selectedEntityId: undefined,
        pinnedInstructionId: undefined,
        liveCommit: undefined,
        diagnostic: undefined,
      });
    },
  }));
}

export const playerStore = createPlayerStore();

export function usePlayerStore<T>(selector: (state: PlayerState) => T): T {
  return useStore(playerStore, selector);
}
