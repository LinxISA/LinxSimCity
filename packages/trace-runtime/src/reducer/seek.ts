import type { ChunkIndexEntry } from "@linxsimcity/trace-schema";

import type { TraceBundleReaderInterface } from "../bundle/types.js";
import { restoreCheckpoint } from "./checkpoint.js";
import { reduceEvents } from "./reduce-event.js";
import {
  initialSnapshot,
  withSnapshotCycle,
  type ViewerSnapshot,
} from "./state.js";

export class SeekError extends Error {
  constructor(
    readonly code: "cycle_out_of_range" | "cycle_not_indexed",
    message: string,
  ) {
    super(message);
    this.name = "SeekError";
  }
}

function containingChunk(
  chunks: readonly ChunkIndexEntry[],
  cycle: number,
): ChunkIndexEntry | undefined {
  let low = 0;
  let high = chunks.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const chunk = chunks[middle]!;
    if (cycle < chunk.firstCycle) high = middle - 1;
    else if (cycle > chunk.lastCycle) low = middle + 1;
    else return chunk;
  }
  return chunks[Math.max(0, high)];
}

export async function seekToCycle(
  reader: TraceBundleReaderInterface,
  targetCycle: number,
): Promise<ViewerSnapshot> {
  const [manifest, topology, index] = await Promise.all([
    reader.readManifest(),
    reader.readTopology(),
    reader.readIndex(),
  ]);
  if (
    !Number.isSafeInteger(targetCycle) ||
    targetCycle < manifest.firstCycle ||
    targetCycle > manifest.lastCycle
  ) {
    throw new SeekError(
      "cycle_out_of_range",
      `cycle ${targetCycle} is outside ${manifest.firstCycle}..${manifest.lastCycle}`,
    );
  }

  const selected = containingChunk(index.chunks, targetCycle);
  if (!selected) {
    throw new SeekError(
      "cycle_not_indexed",
      `cycle ${targetCycle} has no index entry`,
    );
  }
  const checkpoint = await reader.readCheckpoint(selected.checkpointPath);
  let snapshot = restoreCheckpoint(initialSnapshot(topology), checkpoint);
  const replayChunks = index.chunks.filter(
    (chunk) =>
      chunk.lastCycle >= checkpoint.cycle && chunk.firstCycle <= targetCycle,
  );
  for (const chunk of replayChunks) {
    const events = (await reader.readChunk(chunk)).filter(
      (event) => event.cycle >= checkpoint.cycle && event.cycle <= targetCycle,
    );
    snapshot = reduceEvents(snapshot, events);
  }
  return withSnapshotCycle(snapshot, targetCycle);
}
