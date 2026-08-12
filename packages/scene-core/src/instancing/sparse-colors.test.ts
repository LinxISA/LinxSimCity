import { expect, test, vi } from "vitest";

import { InstanceRegistry } from "./instance-registry.js";
import { applySnapshotDelta } from "./sparse-colors.js";

test("five changed CELLs perform five writes and one mesh flush", () => {
  const registry = new InstanceRegistry();
  for (let index = 0; index < 10; index++) {
    registry.register(`pe0.bg.bank0.row${index}`, "cells", index);
  }
  const write = vi.fn();
  const flush = vi.fn();
  const changed = [0, 2, 4, 6, 8].map((row) => `pe0.bg.bank0.row${row}`);
  const result = applySnapshotDelta(registry, changed, {
    colorFor: () => 0xff00ff,
    write,
    flush,
  });
  expect(result).toEqual({ writes: 5, meshes: 1 });
  expect(write).toHaveBeenCalledTimes(5);
  expect(flush).toHaveBeenCalledOnce();
  expect(flush).toHaveBeenCalledWith("cells");
});
