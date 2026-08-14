import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { useMemo } from "react";

import { Building } from "../common/Building.js";
import { DistrictFrame } from "../common/DistrictFrame.js";
import { InstancedBoxes } from "../common/InstancedBoxes.js";
import { entityToBox } from "../topology/placement.js";
import { districtRect, hasPipeviewStageCity } from "../topology/district.js";
import { CacheCells } from "./CacheCells.js";
import { ExecutionPipes } from "./ExecutionPipes.js";
import { PrfCells } from "./PrfCells.js";
import { RobRing } from "./RobRing.js";

interface ScalarCpuProps {
  readonly topology: TopologyDescriptor;
  readonly selectedPe: number;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function ScalarCpu({
  topology,
  selectedPe,
  snapshot,
  selectedEntityId,
  onSelect,
}: ScalarCpuProps) {
  const scalarParent = `pe${selectedPe}.scalar`;
  const stageCity = hasPipeviewStageCity(topology);
  const district = districtRect(topology, "scalar") ?? {
    center: [-88, 0, -4] as const,
    size: [40, 8, 84] as const,
  };
  const modules = useMemo(
    () =>
      topology.entities.filter(
        (entity) =>
          entity.kind === "module" &&
          entity.parentId === scalarParent &&
          entity.placement &&
          /^pe\d+\.scalar\.(bpu|fetch|decode|rename|execute|lsu|commit|retire)$/.test(
            entity.id,
          ),
      ),
    [scalarParent, topology],
  );
  const issueSlots = useMemo(
    () =>
      topology.entities
        .filter(
          (entity) =>
            entity.kind === "queue-slot" &&
            entity.id.startsWith(`pe${selectedPe}.issueq.slot`) &&
            entity.placement,
        )
        .map(entityToBox),
    [selectedPe, topology],
  );
  const sharedCacheModules = topology.entities.filter(
    (entity) =>
      (entity.id === "core.shared.l1i" || entity.id === "core.shared.l1d") &&
      entity.placement,
  );

  return (
    <group>
      <DistrictFrame
        label={`SCALAR O3 · PE${selectedPe}`}
        center={district.center}
        size={district.size}
        color="#a979ff"
      />
      {stageCity
        ? null
        : modules.map((entity) => (
            <Building
              key={entity.id}
              id={entity.id}
              label={entity.label.toUpperCase()}
              position={entity.placement!.position!}
              size={entity.placement!.size!}
              color="#4a2b79"
              emissive="#8454ce"
              onSelect={onSelect}
            />
          ))}
      <RobRing
        topology={topology}
        selectedPe={selectedPe}
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        onSelect={onSelect}
      />
      <PrfCells
        topology={topology}
        selectedPe={selectedPe}
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        onSelect={onSelect}
      />
      <InstancedBoxes
        instances={issueSlots}
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        baseColor={0x62409e}
        emissive={0x8c5bdb}
        onSelect={onSelect}
      />
      {stageCity ? null : (
        <ExecutionPipes
          topology={topology}
          selectedPe={selectedPe}
          snapshot={snapshot}
        />
      )}

      {sharedCacheModules.map((entity) => (
        <Building
          key={entity.id}
          id={entity.id}
          label={entity.label}
          position={entity.placement!.position!}
          size={entity.placement!.size!}
          color="#321c55"
          emissive="#7443b4"
          onSelect={onSelect}
        />
      ))}
      <CacheCells
        cache="l1i"
        topology={topology}
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        onSelect={onSelect}
      />
      <CacheCells
        cache="l1d"
        topology={topology}
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        onSelect={onSelect}
      />
    </group>
  );
}
