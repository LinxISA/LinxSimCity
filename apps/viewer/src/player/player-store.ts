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
  seekPending: false,
  nextRequestId: 0,
};

export function createPlayerStore(
  createWorker: TraceWorkerFactory = () => TraceWorkerClient.spawn(),
): PlayerStore {
  let worker: ReturnType<TraceWorkerFactory> | undefined;
  const getWorker = () => (worker ??= createWorker());

  return createStore<PlayerState>()((set, get) => ({
    ...initialValues,

    async loadTrace(source) {
      set({
        status: "loading",
        diagnostic: undefined,
        selectedEntityId: undefined,
        seekPending: true,
      });
      try {
        const info = await getWorker().load(source);
        const requestId = get().nextRequestId;
        set({ info, nextRequestId: requestId + 1 });
        const snapshot = await getWorker().seek(
          info.manifest.firstCycle,
          requestId,
        );
        set({
          info,
          snapshot,
          cycle: snapshot.cycle,
          status: "ready",
          seekPending: false,
        });
      } catch (error) {
        set({
          status: "error",
          seekPending: false,
          diagnostic: normalizeWorkerError(error),
        });
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
      set({ selectedEntityId: entityId });
    },

    async unload() {
      await worker?.close();
      worker = undefined;
      set({
        ...initialValues,
        info: undefined,
        snapshot: undefined,
        selectedEntityId: undefined,
        diagnostic: undefined,
      });
    },
  }));
}

export const playerStore = createPlayerStore();

export function usePlayerStore<T>(selector: (state: PlayerState) => T): T {
  return useStore(playerStore, selector);
}
