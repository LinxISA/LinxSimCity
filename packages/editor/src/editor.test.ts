import { CORE_BRICK_BY_ID } from "@linxsimcity/component-catalog";
import { createInstance, emptyBlueprint } from "@linxsimcity/world";
import { expect, test } from "vitest";

import { createEditorState, editorReducer } from "./index.js";

test("place, rotate, undo, and redo preserve immutable editor history", () => {
  const instance = createInstance(
    "queue.1",
    CORE_BRICK_BY_ID.get("core.queue")!,
    [0, 0, 0],
  );
  let state = createEditorState(emptyBlueprint());
  state = editorReducer(state, { type: "place", instance });
  state = editorReducer(state, { type: "rotate", instanceId: instance.id });
  expect(state.present.instances[0]?.transform.yawQuarterTurns).toBe(1);
  state = editorReducer(state, { type: "undo" });
  expect(state.present.instances[0]?.transform.yawQuarterTurns).toBe(0);
  state = editorReducer(state, { type: "redo" });
  expect(state.present.instances[0]?.transform.yawQuarterTurns).toBe(1);
});

test("removing a brick removes every incident link", () => {
  const queue = createInstance(
    "queue.1",
    CORE_BRICK_BY_ID.get("core.queue")!,
    [0, 0, 0],
  );
  const alu = createInstance(
    "alu.1",
    CORE_BRICK_BY_ID.get("core.alu")!,
    [8, 0, 0],
  );
  const blueprint = {
    ...emptyBlueprint(),
    instances: [queue, alu],
    links: [
      {
        id: "link.1",
        from: { instanceId: queue.id, portId: "out" },
        to: { instanceId: alu.id, portId: "issue" },
      },
    ],
  } as const;
  const next = editorReducer(createEditorState(blueprint), {
    type: "remove",
    instanceId: queue.id,
  });
  expect(next.present.instances).toEqual([alu]);
  expect(next.present.links).toEqual([]);
});
