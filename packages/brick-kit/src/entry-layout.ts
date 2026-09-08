import type {
  BrickDefinition,
  BrickSize,
} from "@linxsimcity/component-catalog";
import type { BrickInstance } from "@linxsimcity/world";

export interface EntryVisual {
  readonly logicalIndex: number;
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotationY?: number;
}

export interface BrickActivity {
  readonly source: "preview" | "trace";
  readonly occupiedEntries: number;
  readonly headIndex: number;
}

function safeCount(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value! > 0 ? value! : fallback;
}

function sampledLogicalIndex(
  visualIndex: number,
  visibleCount: number,
  logicalCount: number,
): number {
  if (visibleCount <= 1 || logicalCount <= 1) return 0;
  return Math.round((visualIndex / (visibleCount - 1)) * (logicalCount - 1));
}

export function linearEntryLayout(
  logicalCount: number,
  size: BrickSize,
  maxVisible = 16,
): readonly EntryVisual[] {
  const count = Math.min(safeCount(logicalCount, 1), maxVisible);
  const gap = Math.min(0.12, size.x / Math.max(24, count * 8));
  const width = Math.max(0.12, (size.x * 0.76) / count - gap);
  return Array.from({ length: count }, (_, index) => ({
    logicalIndex: sampledLogicalIndex(index, count, logicalCount),
    position: [
      count === 1
        ? 0
        : -size.x * 0.38 + index * ((size.x * 0.76) / (count - 1)),
      size.y * 0.43,
      0,
    ],
    scale: [width, Math.max(0.16, size.y * 0.12), size.z * 0.52],
  }));
}

export function matrixEntryLayout(
  logicalRows: number,
  logicalColumns: number,
  size: BrickSize,
  maxVisible = 32,
): readonly EntryVisual[] {
  const rows = safeCount(logicalRows, 1);
  const columns = safeCount(logicalColumns, 1);
  const visibleRows = Math.min(
    rows,
    Math.max(1, Math.floor(Math.sqrt(maxVisible * (rows / columns)))),
  );
  const visibleColumns = Math.min(
    columns,
    Math.max(1, Math.floor(maxVisible / visibleRows)),
  );
  const stepX = (size.x * 0.72) / Math.max(1, visibleRows);
  const stepZ = (size.z * 0.62) / Math.max(1, visibleColumns);
  const entries: EntryVisual[] = [];
  for (let row = 0; row < visibleRows; row += 1) {
    for (let column = 0; column < visibleColumns; column += 1) {
      const logicalRow = sampledLogicalIndex(row, visibleRows, rows);
      const logicalColumn = sampledLogicalIndex(
        column,
        visibleColumns,
        columns,
      );
      entries.push({
        logicalIndex: logicalRow * columns + logicalColumn,
        position: [
          (row - (visibleRows - 1) / 2) * stepX,
          size.y * 0.43,
          (column - (visibleColumns - 1) / 2) * stepZ,
        ],
        scale: [stepX * 0.68, Math.max(0.14, size.y * 0.1), stepZ * 0.68],
      });
    }
  }
  return entries;
}

export function layeredEntryLayout(
  logicalDimensions: readonly number[],
  size: BrickSize,
  maxVisible = 36,
): readonly EntryVisual[] {
  const [rows = 1, columns = 1, ...remaining] = logicalDimensions.map((value) =>
    safeCount(value, 1),
  );
  const logicalLayers = remaining.reduce(
    (product, value) => product * value,
    1,
  );
  const visibleLayers = Math.min(logicalLayers, 3);
  const perLayer = Math.max(1, Math.floor(maxVisible / visibleLayers));
  return Array.from({ length: visibleLayers }, (_, layer) => {
    const logicalLayer = sampledLogicalIndex(
      layer,
      visibleLayers,
      logicalLayers,
    );
    return matrixEntryLayout(rows, columns, size, perLayer).map((entry) => ({
      ...entry,
      logicalIndex: logicalLayer * rows * columns + entry.logicalIndex,
      position: [
        entry.position[0] + layer * 0.08,
        entry.position[1] + layer * size.y * 0.13,
        entry.position[2] + layer * 0.08,
      ] as const,
    }));
  }).flat();
}

export function circularEntryLayout(
  logicalCount: number,
  size: BrickSize,
  maxVisible = 48,
): readonly EntryVisual[] {
  const count = Math.min(safeCount(logicalCount, 1), maxVisible);
  const radius = Math.min(size.x, size.z) * 0.38;
  const tangential = Math.min(0.32, (Math.PI * 2 * radius * 0.52) / count);
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    return {
      logicalIndex: sampledLogicalIndex(index, count, logicalCount),
      position: [
        Math.cos(angle) * radius,
        size.y * 0.43,
        Math.sin(angle) * radius,
      ],
      scale: [tangential, Math.max(0.18, size.y * 0.13), size.z * 0.09],
      rotationY: -angle,
    };
  });
}

export function logicalEntryCount(
  instance: BrickInstance,
  definition: BrickDefinition,
): number {
  const dimensions = definition.visual.dimensionParameters ?? [];
  if (dimensions.length === 0) return 4;
  return dimensions.reduce(
    (product, parameterId) =>
      product * safeCount(instance.parameters[parameterId], 1),
    1,
  );
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function previewActivity(
  instance: BrickInstance,
  definition: BrickDefinition,
): BrickActivity {
  const count = logicalEntryCount(instance, definition);
  const hash = stableHash(instance.id);
  const occupiedEntries =
    count === 1 ? hash % 2 : 1 + (hash % Math.max(1, Math.ceil(count * 0.46)));
  return {
    source: "preview",
    occupiedEntries,
    headIndex: hash % count,
  };
}

export function entryIsOccupied(
  logicalIndex: number,
  logicalCount: number,
  activity: BrickActivity,
): boolean {
  const distance =
    (logicalIndex - activity.headIndex + logicalCount) % logicalCount;
  return distance < activity.occupiedEntries;
}
