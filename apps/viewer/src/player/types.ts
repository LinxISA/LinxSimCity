import type {
  InstructionTraceState,
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
  readonly selectedPe: 0 | 1 | 2 | 3;
  readonly followCommit: boolean;
  readonly pinnedInstructionId?: number | undefined;
  readonly liveCommit?: InstructionTraceState | undefined;
  readonly recentCommits: readonly InstructionTraceState[];
  readonly diagnostic?: WorkerDiagnostic | undefined;
  readonly seekPending: boolean;
  readonly nextRequestId: number;
  loadTrace(source: WorkerTraceSource): Promise<boolean>;
  seek(cycle: number): Promise<void>;
  play(): void;
  pause(): void;
  step(delta: number): Promise<void>;
  setRate(rate: PlaybackRate): void;
  setMode(mode: ViewerMode): void;
  selectEntity(entityId?: string): void;
  selectPe(pe: 0 | 1 | 2 | 3): void;
  setFollowCommit(enabled: boolean): void;
  pinInstruction(instructionId?: number): void;
  unload(): Promise<void>;
}

export type PlayerStore = StoreApi<PlayerState>;
export type TraceWorkerFactory = () => TraceWorkerApi;
