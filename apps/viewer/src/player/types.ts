import type {
  LoadedTraceInfo,
  SerializedViewerSnapshot,
  TraceWorkerApi,
  WorkerDiagnostic,
  WorkerTraceSource,
} from "@linxsimcity/trace-runtime";
import type { StoreApi } from "zustand";

export type PlayerStatus = "empty" | "loading" | "ready" | "playing" | "error";
export type PlaybackRate = 0.25 | 0.5 | 1 | 2 | 4;
export type ViewerMode = "demo" | "expert";

export interface PlayerState {
  readonly status: PlayerStatus;
  readonly info?: LoadedTraceInfo | undefined;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly cycle: number;
  readonly rate: PlaybackRate;
  readonly mode: ViewerMode;
  readonly selectedEntityId?: string | undefined;
  readonly diagnostic?: WorkerDiagnostic | undefined;
  readonly seekPending: boolean;
  readonly nextRequestId: number;
  loadTrace(source: WorkerTraceSource): Promise<void>;
  seek(cycle: number): Promise<void>;
  play(): void;
  pause(): void;
  step(delta: number): Promise<void>;
  setRate(rate: PlaybackRate): void;
  setMode(mode: ViewerMode): void;
  selectEntity(entityId?: string): void;
  unload(): Promise<void>;
}

export type PlayerStore = StoreApi<PlayerState>;
export type TraceWorkerFactory = () => TraceWorkerApi;
