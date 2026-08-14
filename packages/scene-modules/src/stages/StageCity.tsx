import type { EventEnvelope } from "@linxsimcity/trace-schema";
import type { TopologyDescriptor, TopologyEntity } from "@linxsimcity/topology";
import { useMemo } from "react";

import { RoutePipe } from "../topology/RoutePipe.js";
import {
  eventMatchesStage,
  pipeviewPipes,
  pipeviewStages,
} from "./stage-entities.js";
import { StageBuilding } from "./StageBuilding.js";

const DOMAIN_PIPE_COLORS: Readonly<Record<string, string>> = {
  scalar: "#a979ff",
  scalarMemory: "#91df52",
  vector: "#f2c14e",
  cube: "#ff7138",
  acccvt: "#ff955f",
  tlsu: "#91df52",
  tileBridge: "#6fd663",
};

function stringAttribute(entity: TopologyEntity, name: string): string {
  const value = entity.attributes?.[name];
  return typeof value === "string" ? value : "";
}

function pipeActive(
  pipe: TopologyEntity,
  events: readonly EventEnvelope[],
): boolean {
  const domain = stringAttribute(pipe, "stageDomain");
  const toStage = stringAttribute(pipe, "toStage");
  return events.some(
    (event) =>
      event.entity_id === pipe.id ||
      (domain !== "" &&
        toStage !== "" &&
        eventMatchesStage(event, { domain, stageId: toStage })),
  );
}

export function StageCity({
  topology,
  events,
  selectedEntityId,
  onSelect,
}: {
  readonly topology: TopologyDescriptor;
  readonly events: readonly EventEnvelope[];
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}) {
  const stages = useMemo(() => pipeviewStages(topology), [topology]);
  const pipes = useMemo(() => pipeviewPipes(topology), [topology]);
  return (
    <group>
      {pipes.map((pipe) => {
        const domain = stringAttribute(pipe, "stageDomain");
        const active = pipeActive(pipe, events);
        return (
          <RoutePipe
            key={pipe.id}
            entity={pipe}
            color={
              active ? "#ffffff" : (DOMAIN_PIPE_COLORS[domain] ?? "#4edcff")
            }
            radius={active ? 0.14 : 0.075}
            opacity={active ? 0.96 : 0.22}
          />
        );
      })}
      {stages.map((stage) => (
        <StageBuilding
          key={stage.id}
          entity={stage}
          events={events}
          selected={selectedEntityId === stage.id}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}
