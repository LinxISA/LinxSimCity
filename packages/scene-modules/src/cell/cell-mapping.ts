export const PE_COUNT = 4;
export const BANKS_PER_PE = 8;
export const CELLS_PER_BANK = 256;
export const CELL_BYTES = 128;
export const CELL_INSTANCE_COUNT = PE_COUNT * BANKS_PER_PE * CELLS_PER_BANK;

function bounded(name: string, value: number, limit: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= limit) {
    throw new RangeError(`${name} must be in 0..${limit - 1}`);
  }
  return value;
}

export function cellInstanceId(pe: number, bank: number, row: number): number {
  return (
    bounded("pe", pe, PE_COUNT) * BANKS_PER_PE * CELLS_PER_BANK +
    bounded("bank", bank, BANKS_PER_PE) * CELLS_PER_BANK +
    bounded("row", row, CELLS_PER_BANK)
  );
}

export function cellEntityId(pe: number, bank: number, row: number): string {
  cellInstanceId(pe, bank, row);
  return `pe${pe}.bg.bank${bank}.row${row}`;
}

export function cellByteRange(row: number): {
  firstByte: number;
  lastByte: number;
} {
  bounded("row", row, CELLS_PER_BANK);
  const firstByte = row * CELL_BYTES;
  return { firstByte, lastByte: firstByte + CELL_BYTES - 1 };
}

export function selectedBankGroup(group: number): readonly number[] {
  if (group !== 0 && group !== 1)
    throw new RangeError("bank group must be 0 or 1");
  const first = group * 4;
  return [first, first + 1, first + 2, first + 3];
}

export function cellMapping(pe: number, bank: number, row: number) {
  return {
    pe,
    bank,
    row,
    physCellId: row * BANKS_PER_PE + bank,
    instanceId: cellInstanceId(pe, bank, row),
    entityId: cellEntityId(pe, bank, row),
  } as const;
}

export function topologyCellInstanceId(
  pe: number,
  bank: number,
  row: number,
  rowsPerBank: number,
): number {
  if (!Number.isSafeInteger(rowsPerBank) || rowsPerBank <= 0) {
    throw new RangeError("rowsPerBank must be a positive safe integer");
  }
  return (
    bounded("pe", pe, PE_COUNT) * BANKS_PER_PE * rowsPerBank +
    bounded("bank", bank, BANKS_PER_PE) * rowsPerBank +
    bounded("row", row, rowsPerBank)
  );
}
