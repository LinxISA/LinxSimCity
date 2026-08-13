import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { useMemo } from "react";

import { InstancedBoxes } from "../common/InstancedBoxes.js";
import { entityToBox } from "../topology/placement.js";

interface PrfCellsProps {
  readonly topology: TopologyDescriptor;
  readonly selectedPe: number;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function PrfCells(props: PrfCellsProps) {
  const instances = useMemo(
    () =>
      props.topology.entities
        .filter(
          (entity) =>
            entity.kind === "register" &&
            entity.id.startsWith(`pe${props.selectedPe}.prf.reg`) &&
            entity.placement,
        )
        .map(entityToBox),
    [props.selectedPe, props.topology],
  );
  return (
    <InstancedBoxes
      instances={instances}
      snapshot={props.snapshot}
      selectedEntityId={props.selectedEntityId}
      baseColor={0x8054d2}
      emissive={0x9d76ef}
      onSelect={props.onSelect}
    />
  );
}
