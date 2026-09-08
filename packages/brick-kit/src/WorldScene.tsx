import type { BrickDefinition } from "@linxsimcity/component-catalog";
import type { GeneratedWorld } from "@linxsimcity/world";
import { positionToTuple } from "@linxsimcity/world";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import { ACESFilmicToneMapping, Vector3 } from "three";

import { Brick } from "./Brick.js";
import { previewActivity } from "./entry-layout.js";
import {
  orthogonalRoute,
  portWorldPosition,
  QUEUE_ROUTE_DECK_Y,
  QUEUE_VISUAL_ELEVATION,
} from "./geometry.js";
import { RouteTube } from "./RouteTube.js";

interface SceneContentProps {
  readonly world: GeneratedWorld;
  readonly definitions: ReadonlyMap<string, BrickDefinition>;
  readonly selectedInstanceId: string | undefined;
  readonly onSelect: (instanceId: string) => void;
  readonly onBlank: () => void;
}

function SelectionFocus({
  selectedInstanceId,
  world,
  definitions,
}: Pick<SceneContentProps, "selectedInstanceId" | "world" | "definitions">) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as {
    readonly target: Vector3;
    update: () => void;
  } | null;
  useEffect(() => {
    if (!selectedInstanceId) return;
    const instance = world.instances.find(
      (item) => item.id === selectedInstanceId,
    );
    if (!instance) return;
    const definition = definitions.get(instance.definitionId);
    if (!definition) return;
    const position = new Vector3(...portlessVisualCenter(instance, definition));
    const size = instance.visualSize ?? definition.size;
    const currentTarget = controls?.target ?? new Vector3(0, 1.5, 0);
    const direction = camera.position.clone().sub(currentTarget).normalize();
    const distance = Math.max(size.x, size.y, size.z) * 2.5;
    camera.position.copy(
      position.clone().add(direction.multiplyScalar(distance)),
    );
    camera.lookAt(position);
    camera.updateProjectionMatrix();
    controls?.target.copy(position);
    controls?.update();
  }, [camera, controls, definitions, selectedInstanceId, world.instances]);
  return null;
}

function portlessVisualCenter(
  instance: GeneratedWorld["instances"][number],
  definition: BrickDefinition,
): readonly [number, number, number] {
  const [x, y, z] = positionToTuple(instance.transform.position);
  return [
    x,
    y +
      (definition.kind === "queue" ? QUEUE_VISUAL_ELEVATION : 0) +
      definition.size.y / 2,
    z,
  ];
}

function SceneContent(props: SceneContentProps) {
  const instances = useMemo(
    () => new Map(props.world.instances.map((item) => [item.id, item])),
    [props.world.instances],
  );
  const activity = useMemo(
    () =>
      new Map(
        props.world.instances.flatMap((instance) => {
          const definition = props.definitions.get(instance.definitionId);
          return definition
            ? [[instance.id, previewActivity(instance, definition)] as const]
            : [];
        }),
      ),
    [props.definitions, props.world.instances],
  );
  const routes = useMemo(
    () =>
      props.world.links.flatMap((link, linkIndex) => {
        const fromInstance = instances.get(link.from.instanceId);
        const toInstance = instances.get(link.to.instanceId);
        if (!fromInstance || !toInstance) return [];
        const fromDefinition = props.definitions.get(fromInstance.definitionId);
        const toDefinition = props.definitions.get(toInstance.definitionId);
        if (!fromDefinition || !toDefinition) return [];
        const queueInstanceId =
          fromDefinition.kind === "queue"
            ? fromInstance.id
            : toDefinition.kind === "queue"
              ? toInstance.id
              : undefined;
        const start = portWorldPosition(
          fromInstance,
          fromDefinition,
          link.from.portId,
        );
        const end = portWorldPosition(toInstance, toDefinition, link.to.portId);
        return [
          {
            id: link.id,
            queueInstanceId,
            points: orthogonalRoute(
              start,
              end,
              linkIndex,
              queueInstanceId ? QUEUE_ROUTE_DECK_Y : 0,
            ),
          },
        ];
      }),
    [instances, props.definitions, props.world.links],
  );
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#a4e8ff", "#02060a", 0.72]} />
      <directionalLight
        position={[-20, 36, 22]}
        intensity={3.2}
        color="#e7f8ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
      />
      <pointLight position={[24, 20, -20]} intensity={58} color="#2ec8ff" />
      <pointLight position={[-20, 14, 18]} intensity={38} color="#ff9355" />
      <pointLight position={[0, 28, 0]} intensity={32} color="#8e7dff" />
      <Grid
        position={[0, -0.02, 0]}
        args={[96, 96]}
        cellSize={1}
        cellThickness={0.36}
        cellColor="#143244"
        sectionSize={8}
        sectionThickness={0.72}
        sectionColor="#26718c"
        fadeDistance={500}
        fadeStrength={1.3}
        infiniteGrid
      />
      <Bounds fit clip margin={1.16}>
        <group>
          <SelectionFocus
            selectedInstanceId={props.selectedInstanceId}
            world={props.world}
            definitions={props.definitions}
          />
          {routes.map((route) => (
            <RouteTube
              key={route.id}
              points={route.points}
              queue={route.queueInstanceId !== undefined}
              selected={props.selectedInstanceId === route.queueInstanceId}
              {...(route.queueInstanceId
                ? { onSelect: () => props.onSelect(route.queueInstanceId!) }
                : {})}
            />
          ))}
          {props.world.instances.map((instance) => {
            const definition = props.definitions.get(instance.definitionId);
            const instanceActivity = activity.get(instance.id);
            if (!definition || !instanceActivity) return null;
            return (
              <Brick
                key={instance.id}
                instance={instance}
                definition={definition}
                activity={instanceActivity}
                selected={props.selectedInstanceId === instance.id}
                onSelect={props.onSelect}
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
        maxPolarAngle={Math.PI / 2.03}
        target={[2, 1.5, 1]}
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
        camera={{ position: [23, 23, 29], fov: 38, near: 0.1, far: 3000 }}
        dpr={[1, 1.8]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
        }}
        onPointerMissed={props.onBlank}
        shadows="percentage"
      >
        <color attach="background" args={["#02070b"]} />
        <fog attach="fog" args={["#02070b", 520, 1400]} />
        <Suspense fallback={null}>
          <SceneContent {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}
