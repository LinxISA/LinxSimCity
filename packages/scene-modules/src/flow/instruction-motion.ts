import type {
  InstructionTraceState,
  InstructionTransition,
} from "@linxsimcity/trace-runtime";
import type {
  TopologyDescriptor,
  TopologyEntity,
  TopologyVector3,
} from "@linxsimcity/topology";

export type InstructionCategory =
  "scalar" | "load" | "store" | "branch" | "vector" | "cube";

export type InstructionOverlay = "normal" | "retire" | "squash";

export interface InstructionVisualState {
  readonly instructionId: number;
  readonly threadId: number;
  readonly category: InstructionCategory;
  readonly position: TopologyVector3;
  readonly scale: number;
  readonly overlay: InstructionOverlay;
  readonly terminalProgress: number;
  readonly terminalAge: number;
}

const TRAVEL_CYCLES = 0.75;
const RETIRE_JUMP_CYCLES = 1.1;
const RETIRE_SHRINK_CYCLES = 0.6;
const SQUASH_LIFETIME_CYCLES = 0.7;
const ENTITY_MAP_CACHE = new WeakMap<
  TopologyDescriptor,
  Map<string, TopologyEntity>
>();

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function instructionCategory(
  disassemblyId: string | undefined,
): InstructionCategory {
  const mnemonic = disassemblyId?.trim().toLowerCase() ?? "";
  if (/^(?:gmma|mma|cube)(?:\.|$)/u.test(mnemonic)) return "cube";
  if (/^(?:v|vec)/u.test(mnemonic)) return "vector";
  if (/^(?:t?store|t?st|std)(?:\.|$)/u.test(mnemonic)) return "store";
  if (/^(?:t?load|t?ld|lda)(?:\.|$)/u.test(mnemonic)) return "load";
  if (/^(?:bstart|bstop|br|b\.|jmp|call|ret)/u.test(mnemonic)) return "branch";
  return "scalar";
}

function entityMap(topology: TopologyDescriptor): Map<string, TopologyEntity> {
  const cached = ENTITY_MAP_CACHE.get(topology);
  if (cached) return cached;
  const entities = new Map(
    topology.entities.map((entity) => [entity.id, entity]),
  );
  ENTITY_MAP_CACHE.set(topology, entities);
  return entities;
}

function roofPosition(entity: TopologyEntity): TopologyVector3 | undefined {
  const position = entity.placement?.position;
  if (!position) return undefined;
  if (entity.kind === "rob-slot" || entity.kind === "queue-slot")
    return [...position];
  const height = entity.placement?.size?.[1] ?? 0;
  return [position[0], position[1] + height / 2 + 0.5, position[2]];
}

function interpolate(
  from: TopologyVector3,
  to: TopologyVector3,
  progress: number,
  arcHeight = 0,
): TopologyVector3 {
  const u = clamp(progress);
  return [
    from[0] + (to[0] - from[0]) * u,
    from[1] + (to[1] - from[1]) * u + Math.sin(Math.PI * u) * arcHeight,
    from[2] + (to[2] - from[2]) * u,
  ];
}

function routePosition(
  points: readonly TopologyVector3[],
  progress: number,
): TopologyVector3 | undefined {
  if (points.length < 2) return points[0] ? [...points[0]] : undefined;
  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index]!;
    return Math.hypot(
      point[0] - previous[0],
      point[1] - previous[1],
      point[2] - previous[2],
    );
  });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = clamp(progress) * total;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (remaining <= length || index === lengths.length - 1) {
      return interpolate(
        points[index]!,
        points[index + 1]!,
        length === 0 ? 1 : remaining / length,
      );
    }
    remaining -= length;
  }
  return [...points.at(-1)!];
}

function isVisualTransition(transition: InstructionTransition): boolean {
  return (
    transition.type.startsWith("instruction.") ||
    transition.type === "pipeline.enter" ||
    transition.type === "pipeline.leave"
  );
}

function nonTerminalTransitions(
  instruction: InstructionTraceState,
): readonly InstructionTransition[] {
  const result: InstructionTransition[] = [];
  for (const transition of instruction.transitions) {
    if (!isVisualTransition(transition)) continue;
    if (
      transition.type === "instruction.retire" ||
      transition.type === "instruction.squash"
    )
      continue;
    const previous = result.at(-1);
    if (
      previous?.entityId === transition.entityId &&
      previous.routeId === transition.routeId
    )
      continue;
    result.push(transition);
  }
  return result;
}

function positionForTransition(
  transition: InstructionTransition,
  progress: number,
  entities: ReadonlyMap<string, TopologyEntity>,
): TopologyVector3 | undefined {
  const routeEntity = entities.get(transition.routeId ?? transition.entityId);
  if (routeEntity?.route)
    return routePosition(routeEntity.route.points, progress);
  const entity = entities.get(transition.entityId);
  return entity ? roofPosition(entity) : undefined;
}

function robPosition(
  instruction: InstructionTraceState,
  entities: ReadonlyMap<string, TopologyEntity>,
): TopologyVector3 | undefined {
  if (instruction.robSlot === undefined) return undefined;
  const entity = entities.get(
    `pe${instruction.threadId}.sperob.slot${instruction.robSlot}`,
  );
  return entity ? roofPosition(entity) : undefined;
}

function currentPosition(
  instruction: InstructionTraceState,
  cycle: number,
  entities: ReadonlyMap<string, TopologyEntity>,
): TopologyVector3 | undefined {
  if (instruction.completed) {
    const position = robPosition(instruction, entities);
    if (position) return position;
  }
  const transitions = nonTerminalTransitions(instruction);
  const current = transitions.at(-1);
  if (!current) return robPosition(instruction, entities);
  const progress = clamp((cycle - current.cycle) / TRAVEL_CYCLES);
  const target = positionForTransition(current, progress, entities);
  if (!target) return undefined;
  if (current.routeId || entities.get(current.entityId)?.route) return target;
  const previous = transitions.at(-2);
  if (!previous) return target;
  const start = positionForTransition(previous, 1, entities);
  return start ? interpolate(start, target, progress, 1.4) : target;
}

export function planInstructionMotion(
  instruction: InstructionTraceState,
  cycle: number,
  topology: TopologyDescriptor,
): InstructionVisualState | undefined {
  const entities = entityMap(topology);
  const category = instructionCategory(instruction.disassemblyId);
  const terminalAge = Math.max(0, cycle - (instruction.terminalCycle ?? cycle));

  if (instruction.retired && instruction.terminalCycle !== undefined) {
    const from = robPosition(instruction, entities);
    const retire = entities.get(`pe${instruction.threadId}.scalar.retire`);
    const to = retire ? roofPosition(retire) : undefined;
    if (!from || !to) return undefined;
    const jumpProgress = clamp(terminalAge / RETIRE_JUMP_CYCLES);
    const shrinkAge = Math.max(0, terminalAge - RETIRE_JUMP_CYCLES);
    return {
      instructionId: instruction.id,
      threadId: instruction.threadId,
      category,
      position: interpolate(from, to, jumpProgress, 2.6),
      scale: clamp(1 - shrinkAge / RETIRE_SHRINK_CYCLES),
      overlay: "retire",
      terminalProgress: jumpProgress,
      terminalAge,
    };
  }

  if (instruction.squashed && instruction.terminalCycle !== undefined) {
    const position = currentPosition(
      { ...instruction, completed: false },
      instruction.terminalCycle,
      entities,
    );
    if (!position) return undefined;
    const scale =
      terminalAge < 0.15
        ? 1 + terminalAge * 4
        : clamp(1 - (terminalAge - 0.15) / (SQUASH_LIFETIME_CYCLES - 0.15)) *
          1.6;
    return {
      instructionId: instruction.id,
      threadId: instruction.threadId,
      category,
      position,
      scale,
      overlay: "squash",
      terminalProgress: clamp(terminalAge / SQUASH_LIFETIME_CYCLES),
      terminalAge,
    };
  }

  const position = currentPosition(instruction, cycle, entities);
  if (!position) return undefined;
  return {
    instructionId: instruction.id,
    threadId: instruction.threadId,
    category,
    position,
    scale: 1,
    overlay: "normal",
    terminalProgress: 0,
    terminalAge: 0,
  };
}
