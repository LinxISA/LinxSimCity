import type { EventEnvelope } from "@linxsimcity/trace-schema";

export const THREAD_COLORS = [
  "#39d6ff",
  "#ffcc45",
  "#ff5fc8",
  "#75f06f",
] as const;

function numericPayloadField(
  event: EventEnvelope,
  name: string,
): number | undefined {
  const value = (event.payload as Record<string, unknown>)[name];
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : undefined;
}

export function eventThreadId(event: EventEnvelope): number {
  const payloadThread = numericPayloadField(event, "thread_id");
  if (payloadThread !== undefined) return payloadThread;
  const match = /(?:^|\.)pe([0-3])(?:\.|$)/.exec(event.entity_id);
  return match ? Number(match[1]) : 0;
}

export function threadColor(threadId: number): string {
  return THREAD_COLORS[
    ((threadId % THREAD_COLORS.length) + THREAD_COLORS.length) %
      THREAD_COLORS.length
  ]!;
}

export function tokenColor(event: EventEnvelope): string {
  return threadColor(eventThreadId(event));
}

export function tokenOverlay(
  event: EventEnvelope,
): "normal" | "miss" | "stall" | "flush" | "conflict" {
  if (event.type === "cell.conflict") return "conflict";
  if (event.type === "cache.miss") return "miss";
  if (event.type === "pipeline.stall") return "stall";
  if (event.type === "rob.flush" || event.type === "instruction.squash")
    return "flush";
  return "normal";
}
