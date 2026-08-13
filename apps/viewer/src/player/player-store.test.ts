import type {
  LoadedTraceInfo,
  SerializedViewerSnapshot,
  TraceWorkerApi,
  WorkerTraceSource,
} from "@linxsimcity/trace-runtime";
import { SeekSupersededError } from "@linxsimcity/trace-runtime";
import { expect, test } from "vitest";

import { createPlayerStore } from "./player-store.js";

const info: LoadedTraceInfo = {
  manifest: {
    schemaVersion: "1.0.0",
    modelVersion: "test",
    profile: "pipeline",
    firstCycle: 0,
    lastCycle: 10,
    eventCount: 11,
    chunkCount: 1,
    chunkCycleSpan: 4096,
    checkpointCycleSpan: 4096,
  },
  topology: { schemaVersion: "1.0.0", entities: [] },
  index: { schemaVersion: "1.0.0", chunks: [] },
};

function snapshot(cycle: number): SerializedViewerSnapshot {
  return {
    cycle,
    entities: [],
    activeEvents: [],
    changedEntityIds: [],
    profileAvailability: { overview: true, pipeline: true, forensic: false },
    causal: {
      instructions: [],
      requests: [],
      robs: [],
      prfs: [],
      caches: [],
      cells: [],
      activeRoutes: [],
    },
  };
}

class FakeWorker implements TraceWorkerApi {
  closed = false;
  failLoad = false;
  supersedeRequest: number | undefined;
  blockNextSeek = false;
  finishBlockedSeek: (() => void) | undefined;

  async load(): Promise<LoadedTraceInfo> {
    if (this.failLoad) throw new Error("broken trace");
    return info;
  }

  async seek(cycle: number, requestId: number) {
    if (requestId === this.supersedeRequest) {
      throw new SeekSupersededError(requestId, requestId + 1);
    }
    if (this.blockNextSeek) {
      this.blockNextSeek = false;
      return new Promise<SerializedViewerSnapshot>((resolve) => {
        this.finishBlockedSeek = () => resolve(snapshot(cycle));
      });
    }
    return snapshot(cycle);
  }

  async eventsAt() {
    return [];
  }

  async entityHistory() {
    return [];
  }

  async close() {
    this.closed = true;
  }
}

const source: WorkerTraceSource = { kind: "node-directory", path: "/fixture" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

test("load, seek, playback, mode, and selection transitions are bounded", async () => {
  const worker = new FakeWorker();
  const store = createPlayerStore(() => worker);
  expect(await store.getState().loadTrace(source)).toBe(true);
  expect(store.getState()).toMatchObject({ status: "ready", cycle: 0 });

  store.getState().setRate(4);
  store.getState().setMode("expert");
  store.getState().selectEntity("core.scalar.rob.slot0");
  store.getState().selectPe(2);
  store.getState().setFollowCommit(false);
  store.getState().pinInstruction(77);
  expect(store.getState()).toMatchObject({
    rate: 4,
    mode: "expert",
    selectedEntityId: "core.scalar.rob.slot0",
    selectedPe: 2,
    followCommit: false,
    pinnedInstructionId: 77,
  });

  await store.getState().step(-1);
  expect(store.getState().cycle).toBe(0);
  await store.getState().step(20);
  expect(store.getState().cycle).toBe(10);
  store.getState().play();
  expect(store.getState().status).toBe("ready");
  await store.getState().seek(5);
  store.getState().play();
  expect(store.getState().status).toBe("playing");
  store.getState().pause();
  expect(store.getState().status).toBe("ready");
});

test("superseded seeks do not move the visible cycle", async () => {
  const worker = new FakeWorker();
  const store = createPlayerStore(() => worker);
  await store.getState().loadTrace(source);
  worker.supersedeRequest = store.getState().nextRequestId;
  await store.getState().seek(8);
  expect(store.getState()).toMatchObject({ cycle: 0, status: "ready" });
});

test("derives the live and bounded recent commit trace after every seek", async () => {
  class CommitWorker extends FakeWorker {
    override async seek(cycle: number) {
      const value = snapshot(cycle);
      return {
        ...value,
        causal: {
          ...value.causal,
          instructions: Array.from(
            { length: 10 },
            (_, index) =>
              [
                index,
                {
                  id: index,
                  threadId: (index % 4) as 0 | 1 | 2 | 3,
                  pc: 0x1000 + index * 4,
                  disassemblyId: `fa-${index}`,
                  robSlot: index,
                  stage: "retire",
                  sourceRegisters: [index],
                  destinationRegisters: [index + 1],
                  requestIds: [],
                  routeIds: [`pe${index % 4}.scalar.pipe.alu`],
                  completed: true,
                  retired: true,
                  squashed: false,
                  lastCycle: index,
                  terminalCycle: index,
                },
              ] as const,
          ),
        },
      } satisfies SerializedViewerSnapshot;
    }
  }
  const store = createPlayerStore(() => new CommitWorker());
  await store.getState().loadTrace(source);
  expect(store.getState().liveCommit?.id).toBe(9);
  expect(store.getState().recentCommits).toHaveLength(8);
  expect(store.getState().recentCommits.map(({ id }) => id)).toEqual([
    9, 8, 7, 6, 5, 4, 3, 2,
  ]);
});

test("an in-flight playback seek cannot resume after pause", async () => {
  const worker = new FakeWorker();
  const store = createPlayerStore(() => worker);
  await store.getState().loadTrace(source);
  store.getState().play();
  worker.blockNextSeek = true;

  const pendingStep = store.getState().step(1);
  expect(store.getState()).toMatchObject({
    status: "playing",
    seekPending: true,
  });
  store.getState().pause();
  worker.finishBlockedSeek?.();
  await pendingStep;

  expect(store.getState()).toMatchObject({
    cycle: 1,
    status: "ready",
    seekPending: false,
  });
});

test("load errors are retained and unload closes the worker", async () => {
  const worker = new FakeWorker();
  worker.failLoad = true;
  const store = createPlayerStore(() => worker);
  expect(await store.getState().loadTrace(source)).toBe(false);
  expect(store.getState()).toMatchObject({ status: "error" });
  expect(store.getState().diagnostic?.message).toMatch(/broken trace/);
  await store.getState().unload();
  expect(worker.closed).toBe(true);
  expect(store.getState().status).toBe("empty");
});

test("the newest trace load owns the visible snapshot", async () => {
  const defaultInfo = {
    ...info,
    manifest: { ...info.manifest, firstCycle: 49, lastCycle: 100 },
  };
  const localInfo = {
    ...info,
    manifest: { ...info.manifest, firstCycle: 200, lastCycle: 300 },
  };
  const defaultResult = deferred<LoadedTraceInfo>();
  const localResult = deferred<LoadedTraceInfo>();
  const scheduledLoads = [defaultResult.promise, localResult.promise];

  class ScheduledWorker extends FakeWorker {
    override load(): Promise<LoadedTraceInfo> {
      const result = scheduledLoads.shift();
      if (!result) throw new Error("unexpected trace load");
      return result;
    }
  }

  const firstWorker = new ScheduledWorker();
  const secondWorker = new ScheduledWorker();
  const workers = [firstWorker, secondWorker];
  const store = createPlayerStore(() => {
    const worker = workers.shift();
    if (!worker) throw new Error("unexpected worker creation");
    return worker;
  });

  const defaultLoad = store.getState().loadTrace(source);
  const localLoad = store
    .getState()
    .loadTrace({ kind: "node-directory", path: "/local" });

  localResult.resolve(localInfo);
  expect(await localLoad).toBe(true);
  defaultResult.resolve(defaultInfo);
  expect(await defaultLoad).toBe(false);

  expect(store.getState()).toMatchObject({ status: "ready", cycle: 200 });
  expect(firstWorker.closed).toBe(true);
});

test.each([0.25, 0.5, 1, 2, 4] as const)(
  "accepts the supported %sx playback rate",
  (rate) => {
    const store = createPlayerStore(() => new FakeWorker());
    store.getState().setRate(rate);
    expect(store.getState().rate).toBe(rate);
  },
);
