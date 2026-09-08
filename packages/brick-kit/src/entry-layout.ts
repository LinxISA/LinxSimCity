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
  readonly activeEntryIndices?: readonly number[];
  readonly labels?: readonly string[];
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

export type EntryLayoutProfile = "linear" | "matrix" | "layered" | "circular";

export function logicalEntryCoordinates(
  logicalIndex: number,
  logicalDimensions: readonly number[],
): readonly number[] {
  const dimensions = logicalDimensions.map((value) => safeCount(value, 1));
  const logicalCount = dimensions.reduce(
    (product, value) => product * value,
    1,
  );
  let remaining = Math.min(
    Math.max(0, Math.floor(logicalIndex)),
    logicalCount - 1,
  );
  const coordinates = Array.from({ length: dimensions.length }, () => 0);
  for (let index = dimensions.length - 1; index >= 0; index -= 1) {
    coordinates[index] = remaining % dimensions[index]!;
    remaining = Math.floor(remaining / dimensions[index]!);
  }
  return coordinates;
}

function matrixVisibleShape(
  rows: number,
  columns: number,
  maxVisible: number,
): readonly [number, number] {
  const visibleRows = Math.min(
    rows,
    Math.max(1, Math.floor(Math.sqrt(maxVisible * (rows / columns)))),
  );
  const visibleColumns = Math.min(
    columns,
    Math.max(1, Math.floor(maxVisible / visibleRows)),
  );
  return [visibleRows, visibleColumns];
}

function centeredLogicalPosition(
  coordinate: number,
  logicalExtent: number,
  physicalExtent: number,
): number {
  return ((coordinate + 0.5) / logicalExtent - 0.5) * physicalExtent;
}

export function logicalEntryVisual(
  profile: EntryLayoutProfile,
  logicalIndex: number,
  logicalDimensions: readonly number[],
  size: BrickSize,
  visibleBudget: number,
): EntryVisual {
  const dimensions = logicalDimensions.map((value) => safeCount(value, 1));
  const logicalCount = dimensions.reduce(
    (product, value) => product * value,
    1,
  );
  const clampedIndex = Math.min(
    Math.max(0, Math.floor(logicalIndex)),
    logicalCount - 1,
  );
  const visible = Math.min(
    logicalCount,
    Math.max(1, Math.floor(visibleBudget)),
  );

  if (profile === "circular") {
    const radius = Math.min(size.x, size.z) * 0.38;
    const angle = (clampedIndex / logicalCount) * Math.PI * 2 - Math.PI / 2;
    return {
      logicalIndex: clampedIndex,
      position: [
        Math.cos(angle) * radius,
        size.y * 0.43,
        Math.sin(angle) * radius,
      ],
      scale: [
        Math.min(0.32, (Math.PI * 2 * radius * 0.52) / visible),
        Math.max(0.18, size.y * 0.13),
        size.z * 0.09,
      ],
      rotationY: -angle,
    };
  }

  if (profile === "linear") {
    const gap = Math.min(0.12, size.x / Math.max(24, visible * 8));
    return {
      logicalIndex: clampedIndex,
      position: [
        centeredLogicalPosition(clampedIndex, logicalCount, size.x * 0.76),
        size.y * 0.43,
        0,
      ],
      scale: [
        Math.max(0.12, (size.x * 0.76) / visible - gap),
        Math.max(0.16, size.y * 0.12),
        size.z * 0.52,
      ],
    };
  }

  const [rows = 1, columns = 1, ...remainingDimensions] = dimensions;
  const [row = 0, column = 0, ...remainingCoordinates] =
    logicalEntryCoordinates(clampedIndex, dimensions);
  const logicalLayers = remainingDimensions.reduce(
    (product, value) => product * value,
    1,
  );
  const logicalLayer = remainingCoordinates.reduce(
    (flat, coordinate, index) =>
      flat * remainingDimensions[index]! + coordinate,
    0,
  );
  const visibleLayers = profile === "layered" ? Math.min(logicalLayers, 3) : 1;
  const perLayer = Math.max(1, Math.floor(visible / visibleLayers));
  const [visibleRows, visibleColumns] = matrixVisibleShape(
    rows,
    columns,
    perLayer,
  );
  const layerPosition =
    logicalLayers <= 1
      ? 0
      : (logicalLayer / (logicalLayers - 1)) * (visibleLayers - 1);
  return {
    logicalIndex: clampedIndex,
    position: [
      centeredLogicalPosition(row, rows, size.x * 0.72) + layerPosition * 0.08,
      size.y * 0.43 + layerPosition * size.y * 0.13,
      centeredLogicalPosition(column, columns, size.z * 0.62) +
        layerPosition * 0.08,
    ],
    scale: [
      ((size.x * 0.72) / visibleRows) * 0.68,
      Math.max(0.14, size.y * 0.1),
      ((size.z * 0.62) / visibleColumns) * 0.68,
    ],
  };
}

export function linearEntryLayout(
  logicalCount: number,
  size: BrickSize,
  maxVisible = 16,
): readonly EntryVisual[] {
  const count = Math.min(safeCount(logicalCount, 1), maxVisible);
  return Array.from({ length: count }, (_, index) =>
    logicalEntryVisual(
      "linear",
      sampledLogicalIndex(index, count, logicalCount),
      [logicalCount],
      size,
      count,
    ),
  );
}

export function matrixEntryLayout(
  logicalRows: number,
  logicalColumns: number,
  size: BrickSize,
  maxVisible = 32,
): readonly EntryVisual[] {
  const rows = safeCount(logicalRows, 1);
  const columns = safeCount(logicalColumns, 1);
  const [visibleRows, visibleColumns] = matrixVisibleShape(
    rows,
    columns,
    maxVisible,
  );
  const entries: EntryVisual[] = [];
  for (let row = 0; row < visibleRows; row += 1) {
    for (let column = 0; column < visibleColumns; column += 1) {
      const logicalRow = sampledLogicalIndex(row, visibleRows, rows);
      const logicalColumn = sampledLogicalIndex(
        column,
        visibleColumns,
        columns,
      );
      entries.push(
        logicalEntryVisual(
          "matrix",
          logicalRow * columns + logicalColumn,
          [rows, columns],
          size,
          visibleRows * visibleColumns,
        ),
      );
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
    return matrixEntryLayout(rows, columns, size, perLayer).map((entry) => {
      const [row = 0, column = 0] = logicalEntryCoordinates(
        entry.logicalIndex,
        [rows, columns],
      );
      return logicalEntryVisual(
        "layered",
        (row * columns + column) * logicalLayers + logicalLayer,
        [rows, columns, ...remaining],
        size,
        maxVisible,
      );
    });
  }).flat();
}

export function circularEntryLayout(
  logicalCount: number,
  size: BrickSize,
  maxVisible = 48,
): readonly EntryVisual[] {
  const count = Math.min(safeCount(logicalCount, 1), maxVisible);
  return Array.from({ length: count }, (_, index) =>
    logicalEntryVisual(
      "circular",
      sampledLogicalIndex(index, count, logicalCount),
      [logicalCount],
      size,
      count,
    ),
  );
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
  if (activity.activeEntryIndices) {
    return activity.activeEntryIndices.includes(logicalIndex);
  }
  const distance =
    (logicalIndex - activity.headIndex + logicalCount) % logicalCount;
  return distance < activity.occupiedEntries;
}
