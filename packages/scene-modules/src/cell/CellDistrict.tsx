import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";

import { DistrictFrame } from "../common/DistrictFrame.js";
import { districtRect } from "../topology/district.js";
import { CellBanks } from "./CellBanks.js";
import { Crossbar } from "./Crossbar.js";

interface CellDistrictProps {
  readonly topology: TopologyDescriptor;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function CellDistrict(props: CellDistrictProps) {
  const cellCount = props.topology.entities.filter(
    (entity) => entity.kind === "cell" && entity.placement?.district === "cell",
  ).length;
  const district = districtRect(props.topology, "cell") ?? {
    center: [-26, 0, -3] as const,
    size: [24, 8, 54] as const,
  };
  return (
    <group>
      <DistrictFrame
        label={`BG · ${cellCount || 8192} × 128B CELL`}
        center={district.center}
        size={district.size}
        color="#37cdf5"
      />
      <CellBanks {...props} />
      <Crossbar
        topology={props.topology}
        snapshot={props.snapshot}
        onSelect={props.onSelect}
      />
    </group>
  );
}
