import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";

import { CellDistrict } from "./cell/CellDistrict.js";
import { CubeDistrict } from "./cube/CubeDistrict.js";
import { DataTokenLayer } from "./flow/DataTokenLayer.js";
import { ScalarCpu } from "./scalar/ScalarCpu.js";
import { TlsuDistrict } from "./tlsu/TlsuDistrict.js";
import { VectorDistrict } from "./vector/VectorDistrict.js";

interface CityProps {
  readonly topology: TopologyDescriptor;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function City({ snapshot, selectedEntityId, onSelect }: CityProps) {
  return (
    <group>
      <mesh position={[-9.5, -0.22, 5]} receiveShadow>
        <boxGeometry args={[128, 0.4, 73]} />
        <meshStandardMaterial
          color="#030a13"
          metalness={0.5}
          roughness={0.72}
        />
      </mesh>
      <gridHelper
        args={[160, 160, "#123854", "#081b2a"]}
        position={[-9.5, 0.02, 5]}
      />
      <ScalarCpu
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        onSelect={onSelect}
      />
      <VectorDistrict snapshot={snapshot} onSelect={onSelect} />
      <CellDistrict
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        onSelect={onSelect}
      />
      <CubeDistrict
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        onSelect={onSelect}
      />
      <TlsuDistrict onSelect={onSelect} />
      <DataTokenLayer events={snapshot?.activeEvents ?? []} />
    </group>
  );
}
