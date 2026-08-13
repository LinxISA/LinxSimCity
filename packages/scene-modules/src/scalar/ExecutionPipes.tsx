import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { useMemo } from "react";

import { RoutePipe } from "../topology/RoutePipe.js";
import { stateMap } from "../common/colors.js";

export function ExecutionPipes({
  topology,
  selectedPe,
  snapshot,
}: {
  readonly topology: TopologyDescriptor;
  readonly selectedPe: number;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
}) {
  const pipes = useMemo(
    () =>
      topology.entities.filter(
        (entity) =>
          entity.kind === "pipe" &&
          entity.id.startsWith(`pe${selectedPe}.scalar.pipe.`),
      ),
    [selectedPe, topology],
  );
  const states = stateMap(snapshot);
  return (
    <group>
      {pipes.map((pipe) => (
        <RoutePipe
          key={pipe.id}
          entity={pipe}
          color={
            states.get(pipe.id)?.status === "active" ? "#ffffff" : "#a979ff"
          }
          radius={0.16}
        />
      ))}
    </group>
  );
}
