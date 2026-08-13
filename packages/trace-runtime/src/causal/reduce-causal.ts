import type { EventEnvelope, TraceThreadId } from "@linxsimcity/trace-schema";

import {
  type ActiveRouteState,
  type CacheState,
  type CausalState,
  type CellRequestState,
  type InstructionTraceState,
  type MemoryRequestState,
  type PrfState,
  type RobState,
} from "./types.js";

const INSTRUCTION_VISIBILITY_CYCLES = 16;
const REQUEST_VISIBILITY_CYCLES = 8;

function payloadRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}

function safeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function threadId(value: unknown): TraceThreadId | undefined {
  return value === 0 || value === 1 || value === 2 || value === 3
    ? value
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function appendUnique<T>(values: readonly T[], value: T | undefined): T[] {
  return value === undefined || values.includes(value)
    ? [...values]
    : [...values, value];
}

function instructionStage(event: EventEnvelope): string | undefined {
  if (event.type.startsWith("instruction.")) return event.type.slice(12);
  if (event.type === "rob.allocate") return "allocated";
  if (event.type === "rob.retire") return "retire";
  if (event.type === "rob.flush") return "squash";
  return undefined;
}

function cleanup(state: CausalState, cycle: number): CausalState {
  let instructions = state.instructions;
  for (const [id, instruction] of instructions) {
    if (
      instruction.terminalCycle !== undefined &&
      instruction.terminalCycle + INSTRUCTION_VISIBILITY_CYCLES < cycle
    ) {
      if (instructions === state.instructions)
        instructions = new Map(instructions);
      (instructions as Map<number, InstructionTraceState>).delete(id);
    }
  }
  let requests = state.requests;
  for (const [id, request] of requests) {
    if (
      request.completedCycle !== undefined &&
      request.completedCycle + REQUEST_VISIBILITY_CYCLES < cycle
    ) {
      if (requests === state.requests) requests = new Map(requests);
      (requests as Map<number, MemoryRequestState>).delete(id);
    }
  }
  let activeRoutes = state.activeRoutes;
  for (const [id, route] of activeRoutes) {
    if (route.endCycle < cycle) {
      if (activeRoutes === state.activeRoutes)
        activeRoutes = new Map(activeRoutes);
      (activeRoutes as Map<string, ActiveRouteState>).delete(id);
    }
  }
  return instructions === state.instructions &&
    requests === state.requests &&
    activeRoutes === state.activeRoutes
    ? state
    : { ...state, instructions, requests, activeRoutes };
}

export function reduceCausalEvent(
  input: CausalState,
  event: EventEnvelope,
): CausalState {
  const state = cleanup(input, event.cycle);
  const payload = payloadRecord(event.payload);
  const eventThread = threadId(payload.thread_id);
  const instructionId = safeInteger(payload.instruction_id);
  const requestId = safeInteger(payload.request_id);
  const routeId = text(payload.route_id);

  let instructions = state.instructions;
  let requests = state.requests;
  let robs = state.robs;
  let prfs = state.prfs;
  let caches = state.caches;
  let cells = state.cells;
  let activeRoutes = state.activeRoutes;

  if (instructionId !== undefined && eventThread !== undefined) {
    const previous = instructions.get(instructionId);
    const nextStage = instructionStage(event);
    const squashing =
      event.type === "instruction.squash" || event.type === "rob.flush";
    const retiring =
      event.type === "instruction.retire" || event.type === "rob.retire";
    const squashed = previous?.squashed === true || squashing;
    const retired = !squashed && (previous?.retired === true || retiring);
    const completed =
      previous?.completed === true || event.type === "instruction.complete";
    const terminalCycle =
      squashed || retired
        ? (previous?.terminalCycle ?? event.cycle)
        : previous?.terminalCycle;
    const next: InstructionTraceState = {
      id: instructionId,
      threadId: eventThread,
      pc: safeInteger(payload.pc) ?? previous?.pc,
      disassemblyId: text(payload.disassembly_id) ?? previous?.disassemblyId,
      robSlot: safeInteger(payload.rob_slot) ?? previous?.robSlot,
      stage: squashed ? "squash" : (nextStage ?? previous?.stage ?? "observed"),
      sourceRegisters: previous?.sourceRegisters ?? [],
      destinationRegisters: previous?.destinationRegisters ?? [],
      requestIds: appendUnique(previous?.requestIds ?? [], requestId),
      routeIds: appendUnique(previous?.routeIds ?? [], routeId),
      completed,
      retired,
      squashed,
      lastCycle: event.cycle,
      terminalCycle,
    };
    instructions = new Map(instructions).set(instructionId, next);
  }

  if (requestId !== undefined && eventThread !== undefined) {
    const previous = requests.get(requestId);
    const completed =
      previous?.completed === true || event.type === "memory.response";
    const next: MemoryRequestState = {
      id: requestId,
      instructionId: instructionId ?? previous?.instructionId,
      threadId: eventThread,
      operation: text(payload.operation) ?? previous?.operation,
      stage: event.type,
      entityIds: appendUnique(previous?.entityIds ?? [], event.entity_id),
      routeIds: appendUnique(previous?.routeIds ?? [], routeId),
      cacheLineIds: event.type.startsWith("cache.")
        ? appendUnique(previous?.cacheLineIds ?? [], event.entity_id)
        : (previous?.cacheLineIds ?? []),
      cellIds: event.type.startsWith("cell.")
        ? appendUnique(previous?.cellIds ?? [], event.entity_id)
        : (previous?.cellIds ?? []),
      completed,
      lastCycle: event.cycle,
      completedCycle: completed
        ? (previous?.completedCycle ?? event.cycle)
        : previous?.completedCycle,
    };
    requests = new Map(requests).set(requestId, next);
  }

  if (event.type.startsWith("rob.") && eventThread !== undefined) {
    const slot =
      safeInteger(payload.rob_slot) ??
      safeInteger(/\.slot(\d+)$/u.exec(event.entity_id)?.[1]);
    if (slot !== undefined) {
      const previous = robs.get(event.entity_id);
      const status =
        event.type === "rob.allocate"
          ? "allocated"
          : event.type === "rob.retire"
            ? "retired"
            : event.type === "rob.flush"
              ? "flushed"
              : event.type.slice(4);
      const next: RobState = {
        entityId: event.entity_id,
        slot,
        threadId: eventThread,
        instructionId: instructionId ?? previous?.instructionId,
        status,
        lastCycle: event.cycle,
      };
      robs = new Map(robs).set(event.entity_id, next);
    }
  }

  if (event.type.startsWith("register.") && eventThread !== undefined) {
    const physReg = safeInteger(payload.phys_reg);
    if (physReg !== undefined) {
      const previous = prfs.get(event.entity_id);
      const reads =
        event.type === "register.read"
          ? appendUnique(previous?.lastReadInstructionIds ?? [], instructionId)
          : (previous?.lastReadInstructionIds ?? []);
      const next: PrfState = {
        entityId: event.entity_id,
        physReg,
        threadId: eventThread,
        ready:
          event.type === "register.ready" && typeof payload.ready === "boolean"
            ? payload.ready
            : previous?.ready,
        lastReadInstructionIds: reads,
        lastWriteInstructionId:
          event.type === "register.write"
            ? instructionId
            : previous?.lastWriteInstructionId,
        lastCycle: event.cycle,
      };
      prfs = new Map(prfs).set(event.entity_id, next);

      if (instructionId !== undefined) {
        const instruction = instructions.get(instructionId);
        if (instruction !== undefined) {
          const updated =
            event.type === "register.read"
              ? {
                  ...instruction,
                  sourceRegisters: appendUnique(
                    instruction.sourceRegisters,
                    physReg,
                  ),
                }
              : event.type === "register.write"
                ? {
                    ...instruction,
                    destinationRegisters: appendUnique(
                      instruction.destinationRegisters,
                      physReg,
                    ),
                  }
                : instruction;
          if (updated !== instruction)
            instructions = new Map(instructions).set(instructionId, updated);
        }
      }
    }
  }

  if (event.type.startsWith("cache.") && eventThread !== undefined) {
    const previous = caches.get(event.entity_id);
    const access =
      requestId === undefined
        ? undefined
        : {
            threadId: eventThread,
            requestId,
            instructionId,
            type: event.type,
            cycle: event.cycle,
          };
    const activeAccesses =
      previous?.lastCycle === event.cycle
        ? appendUnique(previous.activeAccesses, access)
        : access === undefined
          ? []
          : [access];
    const next: CacheState = {
      entityId: event.entity_id,
      lineAddress: safeInteger(payload.line_address) ?? previous?.lineAddress,
      set: safeInteger(payload.set) ?? previous?.set,
      way: safeInteger(payload.way) ?? previous?.way,
      tag: safeInteger(payload.tag) ?? previous?.tag,
      state: text(payload.state) ?? previous?.state,
      lastEventType: event.type,
      activeAccesses,
      lastCycle: event.cycle,
    };
    caches = new Map(caches).set(event.entity_id, next);
  }

  if (
    event.type.startsWith("cell.") &&
    eventThread !== undefined &&
    requestId !== undefined
  ) {
    const next: CellRequestState = {
      entityId: event.entity_id,
      requestId,
      threadId: eventThread,
      bank: safeInteger(payload.bank),
      row: safeInteger(payload.row),
      operation: text(payload.operation),
      arbitration: text(payload.arbitration),
      lastCycle: event.cycle,
    };
    cells = new Map(cells).set(event.entity_id, next);
  }

  if (
    event.type === "pipe.transfer" &&
    routeId !== undefined &&
    eventThread !== undefined
  ) {
    const startCycle = safeInteger(payload.start_cycle) ?? event.cycle;
    const endCycle = safeInteger(payload.end_cycle) ?? startCycle + 1;
    const next: ActiveRouteState = {
      routeId,
      entityId: event.entity_id,
      threadId: eventThread,
      instructionId,
      requestId,
      startCycle,
      endCycle,
    };
    activeRoutes = new Map(activeRoutes).set(routeId, next);
  }

  return {
    instructions,
    requests,
    robs,
    prfs,
    caches,
    cells,
    activeRoutes,
  };
}
