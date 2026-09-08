import type { GeneratedWorld } from "@linxsimcity/world";
import { positionRelativeTo, worldPosition } from "@linxsimcity/world";

export function localizeWorldForRendering(
  world: GeneratedWorld,
  selectedInstanceId: string | undefined,
): GeneratedWorld {
  const origin =
    world.instances.find((instance) => instance.id === selectedInstanceId)
      ?.transform.position ?? world.instances[0]?.transform.position;
  if (!origin) return world;
  return {
    ...world,
    instances: world.instances.map((instance) => {
      const local = positionRelativeTo(instance.transform.position, origin);
      return {
        ...instance,
        transform: {
          ...instance.transform,
          position: worldPosition(local[0], local[1], local[2]),
        },
      };
    }),
  };
}
