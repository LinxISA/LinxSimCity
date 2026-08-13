import type { InstructionTraceState } from "@linxsimcity/trace-runtime";
import type { EventEnvelope } from "@linxsimcity/trace-schema";
import type { TopologyDescriptor } from "@linxsimcity/topology";

import {
  planInstructionMotion,
  type InstructionVisualState,
} from "./instruction-motion.js";

export type InstructionBurstKind = "retire" | "squash";

export function isInstructionLifecycleEvent(event: EventEnvelope): boolean {
  return (
    event.type.startsWith("instruction.") ||
    event.type.startsWith("pipeline.") ||
    event.type.startsWith("rob.") ||
    event.type.startsWith("register.")
  );
}

function payloadNumber(
  event: EventEnvelope,
  field: string,
): number | undefined {
  const payload = event.payload as Record<string, unknown>;
  const value = payload[field];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function dataTokenProgress(
  event: EventEnvelope,
  visualCycle: number,
): number {
  const start = payloadNumber(event, "start_cycle") ?? event.cycle;
  const payloadEnd = payloadNumber(event, "end_cycle");
  const end =
    payloadEnd !== undefined && payloadEnd > start ? payloadEnd : start + 0.75;
  return Math.max(0, Math.min(1, (visualCycle - start) / (end - start)));
}

export function buildInstructionVisuals(
  instructions: readonly (readonly [number, InstructionTraceState])[],
  cycle: number,
  topology: TopologyDescriptor,
): readonly InstructionVisualState[] {
  return instructions.flatMap(([, instruction]) => {
    const visual = planInstructionMotion(instruction, cycle, topology);
    return visual && visual.scale > 0 ? [visual] : [];
  });
}

export function burstKindForVisual(
  visual: InstructionVisualState,
): InstructionBurstKind | undefined {
  if (visual.overlay === "squash" && visual.terminalAge <= 0.7) return "squash";
  if (
    visual.overlay === "retire" &&
    visual.terminalAge >= 1.1 &&
    visual.terminalAge <= 1.8
  )
    return "retire";
  return undefined;
}
