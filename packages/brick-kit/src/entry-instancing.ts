import type { BrickActivity, EntryVisual } from "./entry-layout.js";

export type EntryDetailLevel = "near" | "medium" | "far";

export interface EntryDetailBudget {
  readonly level: EntryDetailLevel;
  readonly visibleEntries: number;
}

export interface EntryInstanceGroup {
  readonly state: "occupied" | "empty";
  readonly entries: readonly EntryVisual[];
  readonly logicalIndexByInstance: readonly number[];
}

const MEDIUM_DISTANCE = 44;
const FAR_DISTANCE = 96;

/**
 * Keeps storage detail bounded independently of its logical capacity. The
 * configured maximum remains the near-view ceiling; more distant views use a
 * smaller fraction of that ceiling.
 */
export function entryDetailBudget(
  cameraDistance: number,
  logicalCount: number,
  configuredMaximum: number,
): EntryDetailBudget {
  const logical = Math.max(1, Math.floor(logicalCount));
  const maximum = Math.max(1, Math.floor(configuredMaximum));
  const level: EntryDetailLevel =
    cameraDistance >= FAR_DISTANCE
      ? "far"
      : cameraDistance >= MEDIUM_DISTANCE
        ? "medium"
        : "near";
  const levelMaximum =
    level === "near"
      ? maximum
      : level === "medium"
        ? Math.max(1, Math.ceil(maximum / 2))
        : Math.max(1, Math.ceil(maximum / 4));
  return { level, visibleEntries: Math.min(logical, levelMaximum) };
}

/** Ensures trace-addressed entries remain represented whenever the budget fits. */
export function includePriorityEntries(
  entries: readonly EntryVisual[],
  logicalCount: number,
  priorityIndices: readonly number[] | undefined,
): readonly EntryVisual[] {
  if (!priorityIndices || priorityIndices.length === 0) return entries;

  const prioritized = [
    ...new Set(
      priorityIndices.filter(
        (index) =>
          Number.isSafeInteger(index) && index >= 0 && index < logicalCount,
      ),
    ),
  ].slice(0, entries.length);
  const prioritySet = new Set(prioritized);
  const represented = new Set(entries.map((entry) => entry.logicalIndex));
  const result = entries.map((entry) => ({ ...entry }));

  for (const logicalIndex of prioritized) {
    if (represented.has(logicalIndex)) continue;
    const replaceAt = result.findLastIndex(
      (entry) => !prioritySet.has(entry.logicalIndex),
    );
    if (replaceAt < 0) break;
    represented.delete(result[replaceAt]!.logicalIndex);
    result[replaceAt] = { ...result[replaceAt]!, logicalIndex };
    represented.add(logicalIndex);
  }
  return result;
}

export function groupEntryInstances(
  entries: readonly EntryVisual[],
  logicalCount: number,
  activity: BrickActivity,
  isOccupied: (
    logicalIndex: number,
    logicalCount: number,
    activity: BrickActivity,
  ) => boolean,
): readonly [EntryInstanceGroup, EntryInstanceGroup] {
  const occupied: EntryVisual[] = [];
  const empty: EntryVisual[] = [];
  for (const entry of entries) {
    (isOccupied(entry.logicalIndex, logicalCount, activity)
      ? occupied
      : empty
    ).push(entry);
  }
  return [
    {
      state: "occupied",
      entries: occupied,
      logicalIndexByInstance: occupied.map((entry) => entry.logicalIndex),
    },
    {
      state: "empty",
      entries: empty,
      logicalIndexByInstance: empty.map((entry) => entry.logicalIndex),
    },
  ];
}

export function logicalIndexForInstance(
  group: EntryInstanceGroup,
  instanceIndex: number | undefined,
): number | undefined {
  return instanceIndex === undefined
    ? undefined
    : group.logicalIndexByInstance[instanceIndex];
}
