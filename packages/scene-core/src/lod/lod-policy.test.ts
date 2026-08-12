import { expect, test } from "vitest";

import { resolveLod } from "./lod-policy.js";

test("LOD uses bank/cell bands with hysteresis", () => {
  expect(resolveLod(150, "bank")).toBe("district");
  expect(resolveLod(100, "district")).toBe("bank");
  expect(resolveLod(100, "bank")).toBe("bank");
  expect(resolveLod(50, "bank")).toBe("cell");
  expect(resolveLod(58, "cell")).toBe("cell");
  expect(resolveLod(70, "cell")).toBe("bank");
  expect(resolveLod(200, "cell", true)).toBe("cell");
});
