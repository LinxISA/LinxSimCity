import { expect, test } from "vitest";

import { pickEntity } from "./picker.js";

test("instanced intersections map to exact stable entity IDs", () => {
  expect(
    pickEntity({
      instanceId: 3,
      object: { userData: { instanceEntityIds: ["a", "b", "c", "cell-3"] } },
    }),
  ).toBe("cell-3");
  expect(pickEntity(undefined)).toBeUndefined();
  expect(pickEntity({ object: { userData: { entityId: "scalar.rob" } } })).toBe(
    "scalar.rob",
  );
});
