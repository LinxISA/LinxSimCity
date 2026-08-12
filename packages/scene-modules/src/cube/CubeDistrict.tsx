import { resolveLayout } from "@linxsimcity/scene-core";
import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import { useMemo } from "react";

import { DistrictFrame } from "../common/DistrictFrame.js";
import { StraightPipe } from "../common/StraightPipe.js";
import { CubeMacCells } from "./CubeMacCells.js";
import { CubePeStrip } from "./CubePeStrip.js";
import { StgBufB } from "./StgBufB.js";

interface CubeDistrictProps {
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function CubeDistrict(props: CubeDistrictProps) {
  const layout = useMemo(
    () => resolveLayout({ schemaVersion: "1.0.0", entities: [] }),
    [],
  );
  return (
    <group>
      <DistrictFrame
        label="CUBE · GMMA · 4 PE × (16M × 4N × K16)"
        x={-13}
        z={-30}
        width={66}
        depth={54}
        color="#ff7138"
      />
      {layout.peRows.map((row) => (
        <CubePeStrip key={row.pe} row={row} onSelect={props.onSelect} />
      ))}
      <CubeMacCells {...props} />
      {layout.peRows.flatMap((row) =>
        Array.from({ length: 4 }, (_, lane) => {
          const z = row.cube.z + 2 + lane * 2.45;
          return (
            <StraightPipe
              key={`${row.pe}-${lane}`}
              from={[-13.7, 1.7, z]}
              to={[50.7, 1.7, z]}
              color="#28c9ff"
              radius={0.075}
              opacity={0.8}
            />
          );
        }),
      )}
      <StgBufB {...props} />
    </group>
  );
}
