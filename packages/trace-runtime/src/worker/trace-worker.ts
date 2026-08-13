import type { EventEnvelope } from "@linxsimcity/trace-schema";

import { TraceBundleReader } from "../bundle/open-bundle.js";
import type { TraceBundleReaderInterface } from "../bundle/types.js";
import { seekToCycle } from "../reducer/seek.js";
import type { ViewerSnapshot } from "../reducer/state.js";
import { serializeCausalState } from "../causal/types.js";
import { SeekSupersededError } from "./errors.js";
import type {
  LoadedTraceInfo,
  SerializedViewerSnapshot,
  TraceWorkerApi,
  WorkerTraceSource,
} from "./protocol.js";

function serialize(snapshot: ViewerSnapshot): SerializedViewerSnapshot {
  return {
    cycle: snapshot.cycle,
    entities: [...snapshot.entities.entries()]
      .filter(
        ([, entity]) =>
          entity.status !== "idle" || entity.steadyStatus !== "idle",
      )
      .sort(([left], [right]) => left.localeCompare(right)),
    activeEvents: snapshot.activeEvents,
    changedEntityIds: [...snapshot.changedEntityIds],
    profileAvailability: snapshot.profileAvailability,
    causal: serializeCausalState(snapshot.causal),
  };
}

export class TraceWorkerService implements TraceWorkerApi {
  private reader: TraceBundleReaderInterface | undefined;
  private loaded: LoadedTraceInfo | undefined;
  private latestSeekRequestId = -1;

  private requireReader(): TraceBundleReaderInterface {
    if (!this.reader) {
      const error = new Error("no trace is loaded") as Error & { code: string };
      error.code = "not_loaded";
      throw error;
    }
    return this.reader;
  }

  async load(source: WorkerTraceSource): Promise<LoadedTraceInfo> {
    await this.close();
    const reader = await TraceBundleReader.open(source);
    try {
      const [manifest, topology, index] = await Promise.all([
        reader.readManifest(),
        reader.readTopology(),
        reader.readIndex(),
      ]);
      this.reader = reader;
      this.loaded = { manifest, topology, index };
      this.latestSeekRequestId = -1;
      return this.loaded;
    } catch (error) {
      await reader.close();
      throw error;
    }
  }

  async seek(
    cycle: number,
    requestId: number,
  ): Promise<SerializedViewerSnapshot> {
    if (!Number.isSafeInteger(requestId) || requestId < 0) {
      throw new Error("seek requestId must be a non-negative safe integer");
    }
    if (requestId < this.latestSeekRequestId) {
      throw new SeekSupersededError(requestId, this.latestSeekRequestId);
    }
    this.latestSeekRequestId = requestId;
    const snapshot = await seekToCycle(this.requireReader(), cycle);
    if (requestId !== this.latestSeekRequestId) {
      throw new SeekSupersededError(requestId, this.latestSeekRequestId);
    }
    return serialize(snapshot);
  }

  async eventsAt(cycle: number): Promise<readonly EventEnvelope[]> {
    const reader = this.requireReader();
    const loaded = this.loaded!;
    const chunks = loaded.index.chunks.filter(
      (chunk) => chunk.firstCycle <= cycle && chunk.lastCycle >= cycle,
    );
    const events = await Promise.all(
      chunks.map((chunk) => reader.readChunk(chunk)),
    );
    return events.flat().filter((event) => event.cycle === cycle);
  }

  async entityHistory(
    entityId: string,
    from: number,
    to: number,
  ): Promise<readonly EventEnvelope[]> {
    if (from > to)
      throw new Error("history range start must not exceed its end");
    const reader = this.requireReader();
    const loaded = this.loaded!;
    const chunks = loaded.index.chunks.filter(
      (chunk) => chunk.lastCycle >= from && chunk.firstCycle <= to,
    );
    const events = await Promise.all(
      chunks.map((chunk) => reader.readChunk(chunk)),
    );
    return events
      .flat()
      .filter(
        (event) =>
          event.entity_id === entityId &&
          event.cycle >= from &&
          event.cycle <= to,
      );
  }

  async close(): Promise<void> {
    await this.reader?.close();
    this.reader = undefined;
    this.loaded = undefined;
    this.latestSeekRequestId = -1;
  }
}
