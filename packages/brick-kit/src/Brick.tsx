import type {
  BrickDefinition,
  BrickKind,
} from "@linxsimcity/component-catalog";
import type { BrickInstance } from "@linxsimcity/world";
import { positionToTuple } from "@linxsimcity/world";
import { Html, RoundedBox } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshPhysicalMaterial,
  Quaternion,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import {
  SystolicArray,
  TmaMemoryEngine,
  VectorMacArray,
} from "./EngineArrays.js";
import {
  circularEntryLayout,
  entryIsOccupied,
  layeredEntryLayout,
  linearEntryLayout,
  logicalEntryVisual,
  logicalEntryCount,
  matrixEntryLayout,
} from "./entry-layout.js";
import type { BrickActivity, EntryLayoutProfile } from "./entry-layout.js";
import { sampledLineCount } from "./engine-layout.js";
import {
  entryDetailBudget,
  groupEntryInstances,
  includePriorityEntries,
  logicalIndexForInstance,
} from "./entry-instancing.js";
import type { EntryInstanceGroup } from "./entry-instancing.js";
import { districtColor } from "./geometry.js";

const KIND_COLORS: Record<BrickKind, string> = {
  queue: "#3ad6c6",
  table: "#7aa8ff",
  sram: "#40a4ff",
  "register-file": "#6b78e8",
  alu: "#ffb35c",
  vector: "#e67c48",
  cube: "#ff715b",
  tma: "#42d2a2",
  arbiter: "#d08aff",
  crossbar: "#aa72ff",
  container: "#62768a",
  io: "#5ee1a7",
};

interface InteriorProps {
  readonly instance: BrickInstance;
  readonly definition: BrickDefinition;
  readonly activity: BrickActivity;
  readonly onSelectEntry: (logicalIndex: number) => void;
}

function InstancedEntryCells({
  group,
  circular = false,
  onSelect,
}: {
  readonly group: EntryInstanceGroup;
  readonly circular?: boolean;
  readonly onSelect: (logicalIndex: number) => void;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 3, 0.14), []);
  const occupied = group.state === "occupied";
  const material = useMemo(
    () =>
      new MeshPhysicalMaterial({
        color: occupied ? (circular ? "#ffc86b" : "#84ffe0") : "#1a242b",
        emissive: occupied ? (circular ? "#f08b2e" : "#21d8b2") : "#030608",
        emissiveIntensity: occupied ? 1.1 : 0.04,
        metalness: occupied ? 0.42 : 0.68,
        roughness: occupied ? 0.2 : 0.48,
        clearcoat: occupied ? 0.9 : 0.25,
        clearcoatRoughness: 0.18,
      }),
    [circular, occupied],
  );

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const matrix = new Matrix4();
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    for (const [index, entry] of group.entries.entries()) {
      position.set(...entry.position);
      rotation.setFromAxisAngle(new Vector3(0, 1, 0), entry.rotationY ?? 0);
      scale.set(...entry.scale);
      matrix.compose(position, rotation, scale);
      mesh.current.setMatrixAt(index, matrix);
    }
    mesh.current.count = group.entries.length;
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [group.entries]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const pick = (event: ThreeEvent<MouseEvent>) => {
    const logicalIndex = logicalIndexForInstance(group, event.instanceId);
    if (logicalIndex === undefined) return;
    event.stopPropagation();
    onSelect(logicalIndex);
  };

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, Math.max(1, group.entries.length)]}
      count={group.entries.length}
      castShadow
      userData={{ logicalIndexByInstance: group.logicalIndexByInstance }}
      onClick={pick}
    />
  );
}

function StorageEntries({
  instance,
  definition,
  activity,
  onSelectEntry,
}: InteriorProps) {
  const {
    profile,
    maxVisibleEntries = 16,
    dimensionParameters = [],
  } = definition.visual;
  const logicalCount = logicalEntryCount(instance, definition);
  const logicalDimensions = dimensionParameters.map(
    (parameterId) => instance.parameters[parameterId] ?? 1,
  );
  const camera = useThree((state) => state.camera);
  const worldPosition = positionToTuple(instance.transform.position);
  const brickPosition = useMemo(
    () => new Vector3(worldPosition[0], worldPosition[1], worldPosition[2]),
    [worldPosition[0], worldPosition[1], worldPosition[2]],
  );
  const distanceToCamera = () => camera.position.distanceTo(brickPosition);
  const [detail, setDetail] = useState(() =>
    entryDetailBudget(distanceToCamera(), logicalCount, maxVisibleEntries),
  );
  const detailRef = useRef(detail);
  useFrame(({ camera: frameCamera }) => {
    const next = entryDetailBudget(
      frameCamera.position.distanceTo(brickPosition),
      logicalCount,
      maxVisibleEntries,
    );
    if (
      detailRef.current.level === next.level &&
      detailRef.current.visibleEntries === next.visibleEntries
    ) {
      return;
    }
    detailRef.current = next;
    setDetail(next);
  });
  const entryLayoutProfile: EntryLayoutProfile =
    profile === "rob-circular"
      ? "circular"
      : profile === "table-matrix" || profile === "memory-banks"
        ? logicalDimensions.length > 2
          ? "layered"
          : "matrix"
        : "linear";
  const entryDimensions =
    entryLayoutProfile === "linear" || entryLayoutProfile === "circular"
      ? [logicalCount]
      : logicalDimensions;
  const laidOutEntries = useMemo(
    () =>
      profile === "rob-circular"
        ? circularEntryLayout(
            logicalCount,
            definition.size,
            detail.visibleEntries,
          )
        : profile === "table-matrix" || profile === "memory-banks"
          ? logicalDimensions.length > 2
            ? layeredEntryLayout(
                logicalDimensions,
                definition.size,
                detail.visibleEntries,
              )
            : matrixEntryLayout(
                logicalDimensions[0] ?? 1,
                logicalDimensions[1] ?? 1,
                definition.size,
                detail.visibleEntries,
              )
          : linearEntryLayout(
              logicalCount,
              definition.size,
              detail.visibleEntries,
            ),
    [
      definition.size,
      detail.visibleEntries,
      logicalCount,
      logicalDimensions,
      profile,
    ],
  );
  const entries = useMemo(
    () =>
      includePriorityEntries(
        laidOutEntries,
        logicalCount,
        activity.activeEntryIndices,
        (logicalIndex) =>
          logicalEntryVisual(
            entryLayoutProfile,
            logicalIndex,
            entryDimensions,
            definition.size,
            detail.visibleEntries,
          ),
      ),
    [
      activity.activeEntryIndices,
      definition.size,
      detail.visibleEntries,
      entryDimensions,
      entryLayoutProfile,
      laidOutEntries,
      logicalCount,
    ],
  );
  const groups = useMemo(
    () => groupEntryInstances(entries, logicalCount, activity, entryIsOccupied),
    [activity, entries, logicalCount],
  );
  return (
    <group position={[0, definition.size.y * 0.52, 0]}>
      {profile === "rob-circular" ? (
        <>
          <mesh
            position={[0, definition.size.y * 0.43, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry
              args={[
                Math.min(definition.size.x, definition.size.z) * 0.38,
                0.08,
                8,
                64,
              ]}
            />
            <meshStandardMaterial
              color="#6e4f35"
              emissive="#d06e25"
              emissiveIntensity={0.22}
              metalness={0.76}
              roughness={0.28}
            />
          </mesh>
          <mesh position={[0, definition.size.y * 0.43, 0]}>
            <cylinderGeometry args={[0.42, 0.52, 0.32, 24]} />
            <meshPhysicalMaterial
              color="#263541"
              metalness={0.82}
              roughness={0.24}
              clearcoat={0.7}
            />
          </mesh>
        </>
      ) : (
        <RoundedBox
          position={[0, definition.size.y * 0.35, 0]}
          args={[definition.size.x * 0.84, 0.16, definition.size.z * 0.72]}
          radius={0.08}
          smoothness={3}
        >
          <meshStandardMaterial
            color="#101a23"
            metalness={0.78}
            roughness={0.32}
          />
        </RoundedBox>
      )}
      {groups.map((group) => (
        <InstancedEntryCells
          key={group.state}
          group={group}
          circular={profile === "rob-circular"}
          onSelect={onSelectEntry}
        />
      ))}
      {profile === "rob-circular" ? (
        <>
          <mesh
            position={[
              entries[0]?.position[0] ?? 0,
              definition.size.y * 0.7,
              entries[0]?.position[2] ?? 0,
            ]}
          >
            <coneGeometry args={[0.15, 0.42, 10]} />
            <meshStandardMaterial
              color="#7ee9ff"
              emissive="#2dbedc"
              emissiveIntensity={0.85}
            />
          </mesh>
          <mesh
            position={[
              entries.at(-1)?.position[0] ?? 0,
              definition.size.y * 0.7,
              entries.at(-1)?.position[2] ?? 0,
            ]}
          >
            <coneGeometry args={[0.15, 0.42, 10]} />
            <meshStandardMaterial
              color="#ffc86b"
              emissive="#ee8a2b"
              emissiveIntensity={0.85}
            />
          </mesh>
        </>
      ) : null}
    </group>
  );
}

function Interior({
  instance,
  definition,
  activity,
  onSelectEntry,
}: InteriorProps) {
  const { x, y, z } = definition.size;
  if (
    definition.visual.profile === "table-linear" ||
    definition.visual.profile === "table-matrix" ||
    definition.visual.profile === "memory-banks" ||
    definition.visual.profile === "rob-circular"
  ) {
    return (
      <StorageEntries
        instance={instance}
        definition={definition}
        activity={activity}
        onSelectEntry={onSelectEntry}
      />
    );
  }
  switch (definition.kind) {
    case "queue":
    case "table":
      return null;
    case "sram":
    case "register-file":
      return (
        <group position={[0, y * 0.18, 0]}>
          {[-1.5, -0.5, 0.5, 1.5].map((bank, index) => {
            const occupied = activity.activeEntryIndices
              ? activity.activeEntryIndices.includes(index)
              : index < activity.occupiedEntries % 5;
            return (
              <RoundedBox
                key={bank}
                position={[bank * (x / 4.8), 0, 0]}
                args={[x / 6, y * 0.55, z * 0.62]}
                radius={0.12}
                smoothness={3}
                castShadow
              >
                <meshPhysicalMaterial
                  color={occupied ? "#7bc7ff" : "#1c2b38"}
                  emissive={occupied ? "#176fb0" : "#02070b"}
                  emissiveIntensity={occupied ? 0.62 : 0.04}
                  metalness={0.62}
                  roughness={0.24}
                  clearcoat={0.66}
                />
              </RoundedBox>
            );
          })}
        </group>
      );
    case "alu":
    case "arbiter":
      return (
        <mesh position={[0, y * 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry
            args={[
              Math.min(x, z) * 0.27,
              Math.min(x, z) * 0.36,
              y * 0.55,
              definition.kind === "alu" ? 6 : 12,
            ]}
          />
          <meshPhysicalMaterial
            color={KIND_COLORS[definition.kind]}
            emissive={KIND_COLORS[definition.kind]}
            emissiveIntensity={0.14}
            metalness={0.72}
            roughness={0.22}
            clearcoat={0.72}
          />
        </mesh>
      );
    case "vector":
      return (
        <VectorMacArray
          size={definition.size}
          active={activity.occupiedEntries > 0}
          lanes={instance.parameters.lanes ?? 8}
        />
      );
    case "cube":
      return (
        <SystolicArray
          size={definition.size}
          active={activity.occupiedEntries > 0}
          rows={instance.parameters.rows ?? 4}
          columns={instance.parameters.columns ?? 4}
        />
      );
    case "tma":
      return (
        <TmaMemoryEngine
          size={definition.size}
          active={activity.occupiedEntries > 0}
          channels={instance.parameters.channels ?? 4}
        />
      );
    case "crossbar": {
      const lanes = sampledLineCount(instance.parameters.lanes ?? 4, 12);
      return (
        <group position={[0, y * 0.16, 0]}>
          {Array.from({ length: lanes }, (_, lane) => {
            const offset = lane - (lanes - 1) / 2;
            const normalized = lanes === 1 ? 0 : offset / (lanes - 1);
            return (
              <group key={lane}>
                <mesh
                  position={[0, normalized * y * 0.58, normalized * z * 0.72]}
                >
                  <boxGeometry args={[x * 0.72, y * 0.08, z * 0.1]} />
                  <meshStandardMaterial
                    color="#c496ff"
                    emissive="#6d32a5"
                    emissiveIntensity={0.42}
                    metalness={0.62}
                  />
                </mesh>
                <mesh
                  position={[normalized * x * 0.72, normalized * y * 0.58, 0]}
                >
                  <boxGeometry args={[x * 0.1, y * 0.08, z * 0.72]} />
                  <meshStandardMaterial
                    color="#c496ff"
                    emissive="#6d32a5"
                    emissiveIntensity={0.42}
                    metalness={0.62}
                  />
                </mesh>
              </group>
            );
          })}
        </group>
      );
    }
    case "container":
      return (
        <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry
            args={[Math.min(x, z) * 0.31, Math.min(x, z) * 0.34, 4]}
          />
          <meshStandardMaterial color="#7890a4" side={DoubleSide} />
        </mesh>
      );
    case "io":
      return (
        <group position={[0, y * 0.2, 0]}>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[Math.min(y, z) * 0.28, 0.18, 12, 28]} />
            <meshPhysicalMaterial
              color="#78edb9"
              emissive="#27956e"
              emissiveIntensity={0.52}
              metalness={0.62}
              roughness={0.24}
              clearcoat={0.8}
            />
          </mesh>
        </group>
      );
  }
}

export interface BrickProps {
  readonly instance: BrickInstance;
  readonly definition: BrickDefinition;
  readonly activity: BrickActivity;
  readonly selected: boolean;
  readonly onSelect: (instanceId: string) => void;
  readonly onSelectEntry: (instanceId: string, logicalIndex: number) => void;
}

function HierarchyDistrict({
  instance,
  definition,
  selected,
  onSelect,
}: BrickProps) {
  const position = positionToTuple(instance.transform.position);
  const size = instance.visualSize ?? definition.size;
  const color = districtColor(instance.id, instance.hierarchyDepth);
  const pick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(instance.id);
  };
  return (
    <group position={[position[0], position[1], position[2]]} onClick={pick}>
      <RoundedBox
        position={[0, 0.12, 0]}
        args={[size.x, 0.24, size.z]}
        radius={0.22}
        smoothness={3}
        receiveShadow
      >
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.08}
          metalness={0.58}
          roughness={0.48}
          transparent
          opacity={
            selected ? 0.46 : instance.hierarchyDepth === 0 ? 0.12 : 0.24
          }
          depthWrite={false}
        />
      </RoundedBox>
      <mesh position={[0, 0.26, 0]}>
        <boxGeometry args={[size.x, 0.48, size.z]} />
        <meshBasicMaterial
          color={selected ? "#e3faff" : color}
          wireframe
          transparent
          opacity={selected ? 0.8 : 0.32}
        />
      </mesh>
      <Html position={[-size.x / 2 + 1.2, 0.62, -size.z / 2 + 0.8]}>
        <span
          className="hierarchy-label"
          style={{ borderColor: `${color}80`, color }}
        >
          {instance.label ?? instance.id} · L{instance.hierarchyDepth}
        </span>
      </Html>
    </group>
  );
}

export function Brick({
  instance,
  definition,
  activity,
  selected,
  onSelect,
  onSelectEntry,
}: BrickProps) {
  if (definition.kind === "container") {
    return (
      <HierarchyDistrict
        instance={instance}
        definition={definition}
        activity={activity}
        selected={selected}
        onSelect={onSelect}
        onSelectEntry={onSelectEntry}
      />
    );
  }
  if (definition.kind === "queue") return null;
  const position = positionToTuple(instance.transform.position);
  const color = KIND_COLORS[definition.kind];
  const storageProfile = [
    "table-linear",
    "table-matrix",
    "rob-circular",
  ].includes(definition.visual.profile);
  const rooftopEngine = ["vector", "cube", "tma"].includes(definition.kind);
  const chassisHeight = storageProfile
    ? definition.size.y * 0.78
    : rooftopEngine
      ? definition.size.y * 0.72
      : definition.size.y;
  const rotation = [0, instance.transform.yawRadians, 0] as const;
  const pick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(instance.id);
  };
  return (
    <group
      position={[position[0], position[1], position[2]]}
      rotation={rotation}
      onClick={pick}
    >
      <RoundedBox
        position={[0, 0.14, 0]}
        args={[definition.size.x + 0.48, 0.28, definition.size.z + 0.48]}
        radius={0.16}
        smoothness={3}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial
          color="#0e1821"
          metalness={0.86}
          roughness={0.34}
        />
      </RoundedBox>
      <RoundedBox
        position={[0, chassisHeight / 2, 0]}
        args={[definition.size.x, chassisHeight, definition.size.z]}
        radius={0.24}
        smoothness={4}
        receiveShadow
        castShadow
      >
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.2 : 0.075}
          metalness={0.62}
          roughness={0.26}
          clearcoat={0.82}
          clearcoatRoughness={0.18}
          transparent
          opacity={storageProfile || rooftopEngine ? 0.9 : 0.78}
        />
      </RoundedBox>
      <RoundedBox
        position={[0, chassisHeight * 0.86, 0]}
        args={[definition.size.x * 0.82, 0.08, definition.size.z * 0.76]}
        radius={0.04}
        smoothness={2}
      >
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.34}
          metalness={0.72}
          roughness={0.22}
        />
      </RoundedBox>
      <Interior
        instance={instance}
        definition={definition}
        activity={activity}
        onSelectEntry={(logicalIndex) => {
          onSelect(instance.id);
          onSelectEntry(instance.id, logicalIndex);
        }}
      />
      {activity.labels && activity.labels.length > 0 ? (
        <Html position={[0, definition.size.y + 0.6, 0]} center>
          <span className="engine-label">{activity.labels.join(" · ")}</span>
        </Html>
      ) : null}
      {definition.ports.map((port) => (
        <mesh
          key={port.id}
          position={[
            port.anchor[0],
            definition.size.y + port.anchor[1],
            port.anchor[2],
          ]}
        >
          <sphereGeometry args={[0.18, 16, 12]} />
          <meshStandardMaterial
            color={
              port.direction === "input"
                ? "#69dcff"
                : port.direction === "output"
                  ? "#ffcf68"
                  : "#d49cff"
            }
            emissive={port.direction === "input" ? "#176b8a" : "#845d12"}
            emissiveIntensity={0.7}
          />
        </mesh>
      ))}
      {selected ? (
        <mesh position={[0, definition.size.y / 2, 0]}>
          <boxGeometry
            args={[
              definition.size.x + 0.24,
              definition.size.y + 0.24,
              definition.size.z + 0.24,
            ]}
          />
          <meshBasicMaterial
            color="#d7f7ff"
            wireframe
            transparent
            opacity={0.8}
          />
        </mesh>
      ) : null}
    </group>
  );
}
