import type { TraceEventType, TraceThreadId } from "@linxsimcity/trace-schema";

export interface InstructionTransition {
  readonly cycle: number;
  readonly seq: number;
  readonly type: TraceEventType;
  readonly entityId: string;
  readonly routeId: string | undefined;
}

export interface InstructionTraceState {
  readonly id: number;
  readonly threadId: TraceThreadId;
  readonly pc: number | undefined;
  readonly disassemblyId: string | undefined;
  readonly robSlot: number | undefined;
  readonly stage: string;
  readonly sourceRegisters: readonly number[];
  readonly destinationRegisters: readonly number[];
  readonly requestIds: readonly number[];
  readonly routeIds: readonly string[];
  readonly transitions: readonly InstructionTransition[];
  readonly completed: boolean;
  readonly retired: boolean;
  readonly squashed: boolean;
  readonly lastCycle: number;
  readonly terminalCycle: number | undefined;
}

export interface MemoryRequestState {
  readonly id: number;
  readonly instructionId: number | undefined;
  readonly threadId: TraceThreadId;
  readonly operation: string | undefined;
  readonly stage: string;
  readonly entityIds: readonly string[];
  readonly routeIds: readonly string[];
  readonly cacheLineIds: readonly string[];
  readonly cellIds: readonly string[];
  readonly completed: boolean;
  readonly lastCycle: number;
  readonly completedCycle: number | undefined;
}

export interface RobState {
  readonly entityId: string;
  readonly slot: number;
  readonly threadId: TraceThreadId;
  readonly instructionId: number | undefined;
  readonly status: string;
  readonly lastCycle: number;
}

export interface PrfState {
  readonly entityId: string;
  readonly physReg: number;
  readonly threadId: TraceThreadId;
  readonly ready: boolean | undefined;
  readonly lastReadInstructionIds: readonly number[];
  readonly lastWriteInstructionId: number | undefined;
  readonly lastCycle: number;
}

export interface CacheAccessState {
  readonly threadId: TraceThreadId;
  readonly requestId: number;
  readonly instructionId: number | undefined;
  readonly type: TraceEventType;
  readonly cycle: number;
}

export interface CacheState {
  readonly entityId: string;
  readonly lineAddress: number | undefined;
  readonly set: number | undefined;
  readonly way: number | undefined;
  readonly tag: number | undefined;
  readonly state: string | undefined;
  readonly lastEventType: TraceEventType;
  readonly activeAccesses: readonly CacheAccessState[];
  readonly lastCycle: number;
}

export interface CellRequestState {
  readonly entityId: string;
  readonly requestId: number;
  readonly threadId: TraceThreadId;
  readonly bank: number | undefined;
  readonly row: number | undefined;
  readonly operation: string | undefined;
  readonly arbitration: string | undefined;
  readonly lastCycle: number;
}

export interface ActiveRouteState {
  readonly routeId: string;
  readonly entityId: string;
  readonly threadId: TraceThreadId;
  readonly instructionId: number | undefined;
  readonly requestId: number | undefined;
  readonly startCycle: number;
  readonly endCycle: number;
}

export interface CausalState {
  readonly instructions: ReadonlyMap<number, InstructionTraceState>;
  readonly requests: ReadonlyMap<number, MemoryRequestState>;
  readonly robs: ReadonlyMap<string, RobState>;
  readonly prfs: ReadonlyMap<string, PrfState>;
  readonly caches: ReadonlyMap<string, CacheState>;
  readonly cells: ReadonlyMap<string, CellRequestState>;
  readonly activeRoutes: ReadonlyMap<string, ActiveRouteState>;
}

export interface SerializableCausalState {
  readonly instructions: readonly (readonly [number, InstructionTraceState])[];
  readonly requests: readonly (readonly [number, MemoryRequestState])[];
  readonly robs: readonly (readonly [string, RobState])[];
  readonly prfs: readonly (readonly [string, PrfState])[];
  readonly caches: readonly (readonly [string, CacheState])[];
  readonly cells: readonly (readonly [string, CellRequestState])[];
  readonly activeRoutes: readonly (readonly [string, ActiveRouteState])[];
}

export function initialCausalState(): CausalState {
  return {
    instructions: new Map(),
    requests: new Map(),
    robs: new Map(),
    prfs: new Map(),
    caches: new Map(),
    cells: new Map(),
    activeRoutes: new Map(),
  };
}

function sortedEntries<K extends number | string, V>(
  map: ReadonlyMap<K, V>,
): Array<readonly [K, V]> {
  return [...map.entries()].sort(([left], [right]) =>
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right)),
  );
}

export function serializeCausalState(
  state: CausalState,
): SerializableCausalState {
  return {
    instructions: sortedEntries(state.instructions),
    requests: sortedEntries(state.requests),
    robs: sortedEntries(state.robs),
    prfs: sortedEntries(state.prfs),
    caches: sortedEntries(state.caches),
    cells: sortedEntries(state.cells),
    activeRoutes: sortedEntries(state.activeRoutes),
  };
}

function mapEntries<K, V>(value: unknown, name: string): Map<K, V> {
  if (!Array.isArray(value)) {
    throw new Error(`causal checkpoint ${name} must be an entry array`);
  }
  return new Map(value as Array<[K, V]>);
}

function instructionEntries(
  value: unknown,
): Map<number, InstructionTraceState> {
  const entries = mapEntries<number, InstructionTraceState>(
    value,
    "instructions",
  );
  return new Map(
    [...entries].map(([id, instruction]) => [
      id,
      {
        ...instruction,
        transitions: Array.isArray(instruction.transitions)
          ? instruction.transitions
          : [],
      },
    ]),
  );
}

export function deserializeCausalState(value: unknown): CausalState {
  if (typeof value !== "object" || value === null) {
    throw new Error("causal checkpoint must be an object");
  }
  const record = value as Record<string, unknown>;
  return {
    instructions: instructionEntries(record.instructions),
    requests: mapEntries(record.requests, "requests"),
    robs: mapEntries(record.robs, "robs"),
    prfs: mapEntries(record.prfs, "prfs"),
    caches: mapEntries(record.caches, "caches"),
    cells: mapEntries(record.cells, "cells"),
    activeRoutes: mapEntries(record.activeRoutes, "activeRoutes"),
  };
}
