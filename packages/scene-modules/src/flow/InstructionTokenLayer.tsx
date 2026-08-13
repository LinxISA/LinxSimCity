import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, InstancedMesh, Object3D } from "three";

import type { TopologyDescriptor } from "@linxsimcity/topology";

import {
  planInstructionMotion,
  type InstructionCategory,
} from "./instruction-motion.js";
import { threadColor } from "./thread-colors.js";
import { InstructionBursts } from "./InstructionBursts.js";

const CATEGORY_ORDER: readonly InstructionCategory[] = [
  "scalar",
  "load",
  "store",
  "branch",
  "vector",
  "cube",
];
const CATEGORY_INDEX = new Map(
  CATEGORY_ORDER.map((category, index) => [category, index] as const),
);
const TOKEN_CAPACITY = 1_024;
const TOKEN_SCALE = 0.58;

function TokenGeometry({
  category,
}: {
  readonly category: InstructionCategory;
}) {
  if (category === "load") return <coneGeometry args={[1, 1.8, 4]} />;
  if (category === "store") return <boxGeometry args={[1.35, 1.35, 1.35]} />;
  if (category === "branch") return <tetrahedronGeometry args={[1.25]} />;
  if (category === "vector")
    return <cylinderGeometry args={[0.72, 0.72, 1.7, 10]} />;
  if (category === "cube") return <octahedronGeometry args={[1.15]} />;
  return <sphereGeometry args={[1, 12, 10]} />;
}

export function InstructionTokenLayer({
  snapshot,
  topology,
  onSelectInstruction,
}: {
  readonly snapshot: SerializedViewerSnapshot;
  readonly topology: TopologyDescriptor;
  readonly onSelectInstruction?: ((instructionId: number) => void) | undefined;
}) {
  const meshes = useRef<Array<InstancedMesh | null>>([]);
  const instructionIds = useRef(
    CATEGORY_ORDER.map(() => new Uint32Array(TOKEN_CAPACITY)),
  );
  const phase = useRef(0);
  const snapshotCycle = useRef(snapshot.cycle);
  const work = useMemo(
    () => ({
      counts: new Uint16Array(CATEGORY_ORDER.length),
      dummy: new Object3D(),
      color: new Color(),
    }),
    [],
  );

  if (snapshotCycle.current !== snapshot.cycle) {
    snapshotCycle.current = snapshot.cycle;
    phase.current = 0;
  }

  useFrame((_, delta) => {
    phase.current = Math.min(0.74, phase.current + delta * 60);
    const visualCycle = snapshot.cycle + phase.current;
    work.counts.fill(0);

    for (const [, instruction] of snapshot.causal.instructions) {
      const visual = planInstructionMotion(instruction, visualCycle, topology);
      if (!visual || visual.scale <= 0) continue;
      const categoryIndex = CATEGORY_INDEX.get(visual.category)!;
      const instanceIndex = work.counts[categoryIndex]!;
      if (instanceIndex >= TOKEN_CAPACITY) continue;
      const mesh = meshes.current[categoryIndex];
      if (!mesh) continue;

      work.dummy.position.set(...visual.position);
      work.dummy.rotation.set(
        0,
        0,
        visual.category === "vector" ? Math.PI / 2 : 0,
      );
      work.dummy.scale.setScalar(TOKEN_SCALE * visual.scale);
      work.dummy.updateMatrix();
      mesh.setMatrixAt(instanceIndex, work.dummy.matrix);
      work.color.set(threadColor(visual.threadId));
      mesh.setColorAt(instanceIndex, work.color);
      instructionIds.current[categoryIndex]![instanceIndex] =
        visual.instructionId;
      work.counts[categoryIndex] = instanceIndex + 1;
    }

    for (
      let categoryIndex = 0;
      categoryIndex < CATEGORY_ORDER.length;
      categoryIndex++
    ) {
      const mesh = meshes.current[categoryIndex];
      if (!mesh) continue;
      mesh.count = work.counts[categoryIndex]!;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  const select = (categoryIndex: number) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.instanceId === undefined) return;
    onSelectInstruction?.(
      instructionIds.current[categoryIndex]![event.instanceId]!,
    );
  };

  return (
    <group>
      {CATEGORY_ORDER.map((category, categoryIndex) => (
        <instancedMesh
          key={category}
          ref={(mesh) => {
            meshes.current[categoryIndex] = mesh;
          }}
          args={[undefined, undefined, TOKEN_CAPACITY]}
          frustumCulled={false}
          onClick={select(categoryIndex)}
        >
          <TokenGeometry category={category} />
          <meshBasicMaterial vertexColors color="#ffffff" toneMapped={false} />
        </instancedMesh>
      ))}
      <InstructionBursts snapshot={snapshot} topology={topology} />
    </group>
  );
}
