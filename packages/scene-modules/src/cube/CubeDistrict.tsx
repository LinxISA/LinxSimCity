import { resolveLayout } from "@linxsimcity/scene-core";
import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { useMemo } from "react";

import { DistrictFrame } from "../common/DistrictFrame.js";
import { StraightPipe } from "../common/StraightPipe.js";
import { districtRect, hasPipeviewStageCity } from "../topology/district.js";
import { CubeMacCells } from "./CubeMacCells.js";
import { CubePeStrip } from "./CubePeStrip.js";
import { SharedTileRegister } from "./SharedTileRegister.js";

interface CubeDistrictProps {
  readonly topology: TopologyDescriptor;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function CubeDistrict(props: CubeDistrictProps) {
  const layout = useMemo(
    () => resolveLayout({ schemaVersion: "1.0.0", entities: [] }),
    [],
  );
  const stageCity = hasPipeviewStageCity(props.topology);
  const cubeDistrict = districtRect(props.topology, "cube") ?? {
    center: [20, 0, -3] as const,
    size: [66, 8, 54] as const,
  };
  const sharedDistrict =
    districtRect(props.topology, "shared_tile_register") ??
    districtRect(props.topology, "stgbufb");
  return (
    <group>
      <DistrictFrame
        label="CUBE · GMMA · 4 PE × (16M × 4N × K16)"
        center={cubeDistrict.center}
        size={cubeDistrict.size}
        color="#ff7138"
      />
      {sharedDistrict ? (
        <DistrictFrame
          label="SHARED TILE REGISTER · 256KB"
          center={sharedDistrict.center}
          size={sharedDistrict.size}
          color="#d94fff"
        />
      ) : null}
      {stageCity
        ? null
        : layout.peRows.map((row) => (
            <CubePeStrip key={row.pe} row={row} onSelect={props.onSelect} />
          ))}
      <CubeMacCells {...props} />
      {stageCity
        ? null
        : layout.peRows.flatMap((row) =>
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
      <SharedTileRegister {...props} />
    </group>
  );
}
