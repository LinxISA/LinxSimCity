import type { BrickDefinition } from "@linxsimcity/component-catalog";
import type { GeneratedWorld } from "@linxsimcity/world";
import { Bounds, Grid, Line, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo } from "react";

import { Brick } from "./Brick.js";
import { orthogonalRoute, portWorldPosition } from "./geometry.js";

interface SceneContentProps {
  readonly world: GeneratedWorld;
  readonly definitions: ReadonlyMap<string, BrickDefinition>;
  readonly selectedInstanceId: string | undefined;
  readonly onSelect: (instanceId: string) => void;
  readonly onBlank: () => void;
}

function SceneContent(props: SceneContentProps) {
  const instances = useMemo(
    () => new Map(props.world.instances.map((item) => [item.id, item])),
    [props.world.instances],
  );
  return (
    <>
      <ambientLight intensity={0.72} />
      <hemisphereLight args={["#9bdcff", "#05080d", 0.8]} />
      <directionalLight
        position={[-20, 36, 22]}
        intensity={2.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <pointLight position={[24, 18, -20]} intensity={46} color="#2ec8ff" />
      <pointLight position={[-20, 12, 18]} intensity={32} color="#ff9355" />
      <Grid
        position={[0, -0.02, 0]}
        args={[96, 96]}
        cellSize={1}
        cellThickness={0.42}
        cellColor="#17384c"
        sectionSize={8}
        sectionThickness={0.78}
        sectionColor="#2b7895"
        fadeDistance={500}
        fadeStrength={1.3}
        infiniteGrid
      />
      <Bounds fit clip margin={1.2}>
        <group>
          {props.world.instances.map((instance) => {
            const definition = props.definitions.get(instance.definitionId);
            if (!definition) return null;
            return (
              <Brick
                key={instance.id}
                instance={instance}
                definition={definition}
                selected={props.selectedInstanceId === instance.id}
                onSelect={props.onSelect}
              />
            );
          })}
          {props.world.links.map((link, linkIndex) => {
            const fromInstance = instances.get(link.from.instanceId);
            const toInstance = instances.get(link.to.instanceId);
            if (!fromInstance || !toInstance) return null;
            const fromDefinition = props.definitions.get(
              fromInstance.definitionId,
            );
            const toDefinition = props.definitions.get(toInstance.definitionId);
            if (!fromDefinition || !toDefinition) return null;
            const start = portWorldPosition(
              fromInstance,
              fromDefinition,
              link.from.portId,
            );
            const end = portWorldPosition(
              toInstance,
              toDefinition,
              link.to.portId,
            );
            const targetIsQueue =
              toDefinition.kind === "queue" && fromDefinition.kind !== "queue";
            return (
              <Line
                key={link.id}
                points={orthogonalRoute(start, end, linkIndex)}
                color={targetIsQueue ? "#55d6aa" : "#79e7ff"}
                lineWidth={1.45}
                transparent
                opacity={0.72}
              />
            );
          })}
        </group>
      </Bounds>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.075}
        minDistance={8}
        maxDistance={1200}
        maxPolarAngle={Math.PI / 2.05}
        target={[2, 0, 1]}
      />
    </>
  );
}

export interface WorldSceneProps extends SceneContentProps {
  readonly className: string | undefined;
}

export function WorldScene({ className, ...props }: WorldSceneProps) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [23, 20, 27], fov: 38, near: 0.1, far: 3000 }}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        onPointerMissed={props.onBlank}
        shadows="percentage"
      >
        <color attach="background" args={["#03080d"]} />
        <fog attach="fog" args={["#03080d", 520, 1400]} />
        <Suspense fallback={null}>
          <SceneContent {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}
