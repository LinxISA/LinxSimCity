import type { EventEnvelope } from "@linxsimcity/trace-schema";
import type { TopologyDescriptor, TopologyEntity } from "@linxsimcity/topology";

export interface StageTarget {
  readonly domain: string;
  readonly stageId: string;
}

function attributeString(
  entity: TopologyEntity,
  name: string,
): string | undefined {
  const value = entity.attributes?.[name];
  return typeof value === "string" ? value : undefined;
}

function payloadRecord(event: EventEnvelope): Record<string, unknown> {
  return event.payload as Record<string, unknown>;
}

function normalizeStageId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function eventDomain(event: EventEnvelope): string {
  const entity = event.entity_id.toLowerCase();
  if (event.type === "cube.stage" || entity.includes("cube")) return "cube";
  if (entity.includes("acccvt")) return "acccvt";
  if (entity.includes("vector")) return "vector";
  if (entity.includes("bridge") || entity.includes("bpq")) return "tileBridge";
  if (entity.includes("tlsu") || event.type.startsWith("memory."))
    return "tlsu";
  return "scalar";
}

export function pipeviewStages(
  topology: TopologyDescriptor,
): readonly TopologyEntity[] {
  return topology.entities.filter(
    ({ kind, attributes }) =>
      kind === "module" && attributes?.visualRole === "pipeview-stage",
  );
}

export function pipeviewPipes(
  topology: TopologyDescriptor,
): readonly TopologyEntity[] {
  return topology.entities.filter(
    ({ kind, attributes }) =>
      kind === "pipe" && attributes?.visualRole === "pipeview-pipe",
  );
}

export function eventMatchesStage(
  event: EventEnvelope,
  target: StageTarget,
): boolean {
  const stageId = payloadRecord(event).stage_id;
  if (typeof stageId !== "string") return false;
  return (
    normalizeStageId(stageId) === normalizeStageId(target.stageId) &&
    normalizeStageId(eventDomain(event)) === normalizeStageId(target.domain)
  );
}

export function activeStageBays(
  events: readonly EventEnvelope[],
  stage: TopologyEntity,
): readonly boolean[] {
  const domain = attributeString(stage, "stageDomain");
  const stageId = attributeString(stage, "stageId");
  const active = [false, false, false, false];
  if (!domain || !stageId) return active;
  for (const event of events) {
    if (!eventMatchesStage(event, { domain, stageId })) continue;
    const threadId = payloadRecord(event).thread_id;
    if (
      typeof threadId === "number" &&
      Number.isSafeInteger(threadId) &&
      threadId >= 0 &&
      threadId < active.length
    ) {
      active[threadId] = true;
    }
  }
  return active;
}

export function stageTarget(entity: TopologyEntity): StageTarget | undefined {
  const domain = attributeString(entity, "stageDomain");
  const stageId = attributeString(entity, "stageId");
  return domain && stageId ? { domain, stageId } : undefined;
}
