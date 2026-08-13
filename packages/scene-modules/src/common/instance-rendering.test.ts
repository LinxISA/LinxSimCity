import { expect, test } from "vitest";

import { shadowsForInstances } from "./instance-rendering.js";

test("dense physical arrays skip the duplicate shadow pass", () => {
  expect(shadowsForInstances(4_096)).toBe(true);
  expect(shadowsForInstances(81_920)).toBe(false);
});
