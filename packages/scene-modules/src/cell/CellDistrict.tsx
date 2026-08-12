import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";

import { DistrictFrame } from "../common/DistrictFrame.js";
import { CellBanks } from "./CellBanks.js";
import { Crossbar } from "./Crossbar.js";

interface CellDistrictProps {
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function CellDistrict(props: CellDistrictProps) {
  return (
    <group>
      <DistrictFrame
        label="BG · 4 × (8 BANK × 256 CELL × 128B)"
        x={-38}
        z={-30}
        width={24}
        depth={54}
        color="#37cdf5"
      />
      <CellBanks {...props} />
      <Crossbar onSelect={props.onSelect} />
    </group>
  );
}
