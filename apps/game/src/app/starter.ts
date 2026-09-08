import { CORE_BRICK_BY_ID } from "@linxsimcity/component-catalog";
import { createInstance, emptyBlueprint } from "@linxsimcity/world";
import type { Blueprint } from "@linxsimcity/world";

export function createStarterBlueprint(): Blueprint {
  const requestQueue = createInstance(
    "queue.request",
    CORE_BRICK_BY_ID.get("core.queue")!,
    [-10, 0, 0],
  );
  const tileSram = createInstance(
    "sram.tile",
    CORE_BRICK_BY_ID.get("core.sram")!,
    [0, 0, 8],
  );
  const vector = createInstance(
    "vector.0",
    CORE_BRICK_BY_ID.get("core.vector")!,
    [4, 0, -2],
  );
  const writeback = createInstance(
    "sram.writeback",
    CORE_BRICK_BY_ID.get("core.sram")!,
    [14, 0, 1],
  );
  return {
    ...emptyBlueprint("starter.pipeline", "Tile data path"),
    instances: [requestQueue, tileSram, vector, writeback],
    links: [
      {
        id: "link.request-vector",
        from: { instanceId: requestQueue.id, portId: "out" },
        to: { instanceId: vector.id, portId: "issue" },
      },
      {
        id: "link.tile-vector",
        from: { instanceId: tileSram.id, portId: "tile-out" },
        to: { instanceId: vector.id, portId: "tile" },
      },
      {
        id: "link.vector-writeback",
        from: { instanceId: vector.id, portId: "result" },
        to: { instanceId: writeback.id, portId: "tile-in" },
      },
    ],
  };
}
