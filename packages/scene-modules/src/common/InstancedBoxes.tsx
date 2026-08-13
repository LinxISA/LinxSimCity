import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";

import { colorForState, stateMap } from "./colors.js";
import type { BoxInstance } from "./box-instance.js";
import { shadowsForInstances } from "./instance-rendering.js";

export type { BoxInstance } from "./box-instance.js";

interface InstancedBoxesProps {
  readonly instances: readonly BoxInstance[];
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly baseColor: number;
  readonly emissive?: number;
  readonly roughness?: number;
  readonly metalness?: number;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const scale = new Vector3();
const color = new Color();

export function InstancedBoxes({
  instances,
  snapshot,
  selectedEntityId,
  baseColor,
  emissive = 0x000000,
  roughness = 0.62,
  metalness = 0.25,
  onSelect,
}: InstancedBoxesProps) {
  const mesh = useRef<InstancedMesh>(null);
  const previousCycle = useRef<number | undefined>(undefined);
  const previousSelected = useRef<string | undefined>(undefined);
  const indexById = useMemo(
    () =>
      new Map(
        instances.map((instance, index) => [instance.id, index] as const),
      ),
    [instances],
  );
  const states = useMemo(() => stateMap(snapshot), [snapshot]);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    instances.forEach((instance, index) => {
      position.set(...instance.position);
      quaternion.setFromAxisAngle(
        new Vector3(0, 1, 0),
        instance.rotationY ?? 0,
      );
      scale.set(...instance.scale);
      matrix.compose(position, quaternion, scale);
      mesh.current!.setMatrixAt(index, matrix);
      color.setHex(baseColor);
      mesh.current!.setColorAt(index, color);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true;
  }, [instances, baseColor]);

  useEffect(() => {
    if (!mesh.current || !snapshot) return;
    const discontinuous =
      previousCycle.current === undefined ||
      snapshot.cycle < previousCycle.current ||
      snapshot.cycle - previousCycle.current > 1;
    const changed = new Set(
      discontinuous ? instances.map(({ id }) => id) : snapshot.changedEntityIds,
    );
    for (const id of states.keys()) changed.add(id);
    if (previousSelected.current) changed.add(previousSelected.current);
    if (selectedEntityId) changed.add(selectedEntityId);
    for (const id of changed) {
      const index = indexById.get(id);
      if (index === undefined) continue;
      color.setHex(
        colorForState(
          states.get(id),
          baseColor,
          id === selectedEntityId,
          snapshot.cycle,
        ),
      );
      mesh.current.setColorAt(index, color);
    }
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true;
    previousCycle.current = snapshot.cycle;
    previousSelected.current = selectedEntityId;
  }, [baseColor, indexById, instances, selectedEntityId, snapshot, states]);

  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.instanceId === undefined) return;
    const entityId = instances[event.instanceId]?.id;
    if (entityId) onSelect?.(entityId);
  };
  const shadows = shadowsForInstances(instances.length);

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, instances.length]}
      userData={{ instanceEntityIds: instances.map(({ id }) => id) }}
      onClick={select}
      castShadow={shadows}
      receiveShadow={shadows}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        vertexColors
        color="#ffffff"
        emissive={emissive}
        emissiveIntensity={0.12}
        roughness={roughness}
        metalness={metalness}
      />
    </instancedMesh>
  );
}
