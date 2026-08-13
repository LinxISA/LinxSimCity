import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { useMemo } from "react";

import { InstancedBoxes } from "../common/InstancedBoxes.js";
import { entityToBox } from "../topology/placement.js";

interface CacheCellsProps {
  readonly cache: "l1i" | "l1d";
  readonly topology: TopologyDescriptor;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function CacheCells(props: CacheCellsProps) {
  const instances = useMemo(
    () =>
      props.topology.entities
        .filter(
          (entity) =>
            entity.kind === "cache-line" &&
            entity.id.startsWith(`core.shared.${props.cache}.set`) &&
            entity.placement,
        )
        .map(entityToBox),
    [props.cache, props.topology],
  );
  return (
    <InstancedBoxes
      instances={instances}
      snapshot={props.snapshot}
      selectedEntityId={props.selectedEntityId}
      baseColor={props.cache === "l1i" ? 0x5d3e9e : 0x7443b4}
      emissive={0x7d4dca}
      onSelect={props.onSelect}
    />
  );
}
