import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";

import { CellDistrict } from "./cell/CellDistrict.js";
import { CubeDistrict } from "./cube/CubeDistrict.js";
import { DataTokenLayer } from "./flow/DataTokenLayer.js";
import { ScalarCpu } from "./scalar/ScalarCpu.js";
import { TlsuDistrict } from "./tlsu/TlsuDistrict.js";
import { RoutePipe } from "./topology/RoutePipe.js";
import { VectorDistrict } from "./vector/VectorDistrict.js";

interface CityProps {
  readonly topology: TopologyDescriptor;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly selectedPe?: number | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
  readonly onSelectInstruction?: ((instructionId: number) => void) | undefined;
}

export function City({
  topology,
  snapshot,
  selectedEntityId,
  selectedPe = 0,
  onSelect,
  onSelectInstruction,
}: CityProps) {
  const coreDistrict = topology.layout?.districts.find(
    (district) => district.id === "core",
  );
  const floorWidth = coreDistrict?.size[0] ?? 128;
  const floorDepth = coreDistrict?.size[2] ?? 73;
  const floorX = coreDistrict?.position[0] ?? -9.5;
  const floorZ = coreDistrict?.position[2] ?? 5;
  const dataPipes = topology.entities.filter(
    (entity) =>
      entity.kind === "pipe" &&
      !entity.id.includes(".scalar.pipe.") &&
      entity.route,
  );
  return (
    <group>
      <mesh position={[floorX, -0.22, floorZ]} receiveShadow>
        <boxGeometry args={[floorWidth, 0.4, floorDepth]} />
        <meshStandardMaterial
          color="#030a13"
          metalness={0.5}
          roughness={0.72}
        />
      </mesh>
      <gridHelper
        args={[160, 160, "#123854", "#081b2a"]}
        position={[floorX, 0.02, floorZ]}
      />
      <ScalarCpu
        topology={topology}
        selectedPe={selectedPe}
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        onSelect={onSelect}
      />
      <VectorDistrict
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        onSelect={onSelect}
      />
      <CellDistrict
        topology={topology}
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        onSelect={onSelect}
      />
      <CubeDistrict
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        onSelect={onSelect}
      />
      <TlsuDistrict
        topology={topology}
        snapshot={snapshot}
        onSelect={onSelect}
      />
      {dataPipes.map((pipe) => (
        <RoutePipe
          key={pipe.id}
          entity={pipe}
          color={pipe.attributes?.operand === "B" ? "#d94fff" : "#29c8ff"}
        />
      ))}
      <DataTokenLayer
        events={snapshot?.activeEvents ?? []}
        topology={topology}
        onSelect={onSelect}
        onSelectInstruction={onSelectInstruction}
      />
    </group>
  );
}
