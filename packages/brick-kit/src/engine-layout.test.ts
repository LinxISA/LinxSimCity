import { describe, expect, test } from "vitest";

import { sampledGrid, sampledLineCount } from "./engine-layout.js";

describe("parameterized engine layout", () => {
  test("preserves vector and TMA lane counts within the render budget", () => {
    expect(sampledLineCount(4)).toBe(4);
    expect(sampledLineCount(16)).toBe(16);
    expect(sampledLineCount(128)).toBe(16);
  });

  test("renders exact practical systolic arrays and samples oversized arrays", () => {
    expect(sampledGrid(4, 4)).toEqual({
      rows: 4,
      columns: 4,
      sampled: false,
    });
    expect(sampledGrid(16, 4)).toEqual({
      rows: 16,
      columns: 4,
      sampled: false,
    });
    const oversized = sampledGrid(64, 64);
    expect(oversized.sampled).toBe(true);
    expect(oversized.rows * oversized.columns).toBeLessThanOrEqual(64);
    expect(oversized.rows).toBe(oversized.columns);
  });

  test("keeps highly rectangular arrays visibly rectangular", () => {
    const horizontal = sampledGrid(4, 64);
    const vertical = sampledGrid(64, 4);
    expect(horizontal.columns).toBeGreaterThan(horizontal.rows);
    expect(vertical.rows).toBeGreaterThan(vertical.columns);
  });
});
