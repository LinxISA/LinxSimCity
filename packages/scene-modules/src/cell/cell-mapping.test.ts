import { expect, test } from "vitest";

import {
  cellByteRange,
  cellEntityId,
  cellInstanceId,
  cellMapping,
  selectedBankGroup,
} from "./cell-mapping.js";

test("CELL mapping covers four PEs, eight thin banks, and 256 128B rows", () => {
  expect(cellInstanceId(0, 0, 0)).toBe(0);
  expect(cellInstanceId(3, 7, 255)).toBe(8_191);
  expect(cellMapping(2, 5, 23)).toEqual({
    pe: 2,
    bank: 5,
    row: 23,
    physCellId: 189,
    instanceId: 5_399,
    entityId: "pe2.bg.bank5.row23",
  });
  expect(cellEntityId(2, 5, 23)).toBe("pe2.bg.bank5.row23");
  expect(cellByteRange(23)).toEqual({ firstByte: 2_944, lastByte: 3_071 });
  expect(selectedBankGroup(0)).toEqual([0, 1, 2, 3]);
  expect(selectedBankGroup(1)).toEqual([4, 5, 6, 7]);
});
