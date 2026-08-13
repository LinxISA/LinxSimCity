import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { useMemo } from "react";

import { InstancedBoxes } from "../common/InstancedBoxes.js";
import { entityToBox } from "../topology/placement.js";

interface CrossbarProps {
  readonly topology: TopologyDescriptor;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function Crossbar({ topology, snapshot, onSelect }: CrossbarProps) {
  const lanes = useMemo(
    () =>
      topology.entities
        .filter((entity) => entity.kind === "xbar-lane" && entity.placement)
        .map(entityToBox),
    [topology],
  );
  return (
    <InstancedBoxes
      instances={lanes}
      snapshot={snapshot}
      baseColor={0x1c9dcc}
      emissive={0x23bbf0}
      onSelect={onSelect}
    />
  );
}
