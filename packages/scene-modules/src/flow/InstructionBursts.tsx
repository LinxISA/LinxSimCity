import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";
import type { TopologyDescriptor } from "@linxsimcity/topology";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  InstancedMesh,
  Object3D,
} from "three";

import { burstKindForVisual } from "./instruction-layer.js";
import { planInstructionMotion } from "./instruction-motion.js";

const BURST_CAPACITY = 1_024;

export function InstructionBursts({
  snapshot,
  topology,
}: {
  readonly snapshot: SerializedViewerSnapshot;
  readonly topology: TopologyDescriptor;
}) {
  const rings = useRef<InstancedMesh>(null);
  const crosses = useRef<InstancedMesh>(null);
  const phase = useRef(0);
  const snapshotCycle = useRef(snapshot.cycle);
  const work = useMemo(
    () => ({ dummy: new Object3D(), color: new Color() }),
    [],
  );

  if (snapshotCycle.current !== snapshot.cycle) {
    snapshotCycle.current = snapshot.cycle;
    phase.current = 0;
  }

  useFrame((_, delta) => {
    phase.current = Math.min(0.74, phase.current + delta * 60);
    const visualCycle = snapshot.cycle + phase.current;
    let ringCount = 0;
    let crossCount = 0;

    for (const [, instruction] of snapshot.causal.instructions) {
      const visual = planInstructionMotion(instruction, visualCycle, topology);
      if (!visual) continue;
      const kind = burstKindForVisual(visual);
      if (!kind) continue;
      const progress =
        kind === "retire"
          ? Math.max(0, Math.min(1, (visual.terminalAge - 1.1) / 0.7))
          : visual.terminalProgress;
      const fade = 1 - progress;

      if (rings.current && ringCount < BURST_CAPACITY) {
        work.dummy.position.set(
          visual.position[0],
          visual.position[1] + 0.08,
          visual.position[2],
        );
        work.dummy.rotation.set(-Math.PI / 2, 0, 0);
        work.dummy.scale.setScalar(0.35 + progress * 3.1);
        work.dummy.updateMatrix();
        rings.current.setMatrixAt(ringCount, work.dummy.matrix);
        work.color.setRGB(
          kind === "retire" ? 2.8 * fade : 3.4 * fade,
          kind === "retire" ? 1.8 * fade : 0.08,
          kind === "retire" ? 0.25 * fade : 0.03,
        );
        rings.current.setColorAt(ringCount, work.color);
        ringCount++;
      }

      if (kind === "squash" && crosses.current) {
        for (let arm = 0; arm < 2 && crossCount < BURST_CAPACITY; arm++) {
          work.dummy.position.set(
            visual.position[0],
            visual.position[1] + progress * 0.8,
            visual.position[2],
          );
          work.dummy.rotation.set(0, arm === 0 ? Math.PI / 4 : -Math.PI / 4, 0);
          work.dummy.scale.set(0.8 + progress * 1.2, 0.09, 0.09);
          work.dummy.updateMatrix();
          crosses.current.setMatrixAt(crossCount, work.dummy.matrix);
          work.color.setRGB(4.5 * fade, 0.08, 0.02);
          crosses.current.setColorAt(crossCount, work.color);
          crossCount++;
        }
      }
    }

    if (rings.current) {
      rings.current.count = ringCount;
      rings.current.instanceMatrix.needsUpdate = true;
      if (rings.current.instanceColor)
        rings.current.instanceColor.needsUpdate = true;
    }
    if (crosses.current) {
      crosses.current.count = crossCount;
      crosses.current.instanceMatrix.needsUpdate = true;
      if (crosses.current.instanceColor)
        crosses.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh
        ref={rings}
        args={[undefined, undefined, BURST_CAPACITY]}
        frustumCulled={false}
      >
        <ringGeometry args={[0.72, 1, 32]} />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.9}
          toneMapped={false}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
        />
      </instancedMesh>
      <instancedMesh
        ref={crosses}
        args={[undefined, undefined, BURST_CAPACITY]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.95}
          toneMapped={false}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </instancedMesh>
    </group>
  );
}
