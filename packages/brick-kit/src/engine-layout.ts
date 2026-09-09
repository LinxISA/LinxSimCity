export interface SampledGrid {
  readonly rows: number;
  readonly columns: number;
  readonly sampled: boolean;
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function sampledLineCount(count: number, budget = 16): number {
  return Math.min(positiveInteger(count, 1), positiveInteger(budget, 1));
}

export function sampledGrid(
  rows: number,
  columns: number,
  budget = 64,
): SampledGrid {
  const actualRows = positiveInteger(rows, 1);
  const actualColumns = positiveInteger(columns, 1);
  const maximumCells = positiveInteger(budget, 1);
  if (actualRows * actualColumns <= maximumCells) {
    return { rows: actualRows, columns: actualColumns, sampled: false };
  }

  const scale = Math.sqrt(maximumCells / (actualRows * actualColumns));
  let visibleRows = Math.max(1, Math.floor(actualRows * scale));
  let visibleColumns = Math.max(1, Math.floor(actualColumns * scale));
  while (visibleRows * visibleColumns > maximumCells) {
    if (visibleRows / actualRows >= visibleColumns / actualColumns) {
      visibleRows -= 1;
    } else {
      visibleColumns -= 1;
    }
  }
  return {
    rows: visibleRows,
    columns: visibleColumns,
    sampled: true,
  };
}
