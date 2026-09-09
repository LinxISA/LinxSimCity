import type { DecimalU64, SimTraceEvent } from "@linxsimcity/trace-schema";

import { TraceBundleReader } from "../bundle/open-bundle.js";
import type {
  TraceBundleReaderInterface,
  TraceBundleSource,
} from "../bundle/types.js";
import { seekToCycle } from "../reducer/seek.js";
import type { SimTraceSnapshot } from "../reducer/state.js";
import { SeekSupersededError } from "./errors.js";
import type {
  LoadedTraceInfo,
  SerializedSimTraceSnapshot,
  TraceWorkerApi,
} from "./protocol.js";

function within(value: DecimalU64, from: DecimalU64, to: DecimalU64): boolean {
  const current = BigInt(value);
  return current >= BigInt(from) && current <= BigInt(to);
}

function validRequestId(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function serializeSimTraceSnapshot(
  snapshot: SimTraceSnapshot,
): SerializedSimTraceSnapshot {
  return structuredClone(snapshot);
}

export class TraceWorkerService implements TraceWorkerApi {
  private reader: TraceBundleReaderInterface | undefined;
  private info: LoadedTraceInfo | undefined;
  private latestRequestId = -1;
  private activeSeek: AbortController | undefined;

  async load(source: TraceBundleSource): Promise<LoadedTraceInfo> {
    await this.close();
    const reader = await TraceBundleReader.open(source);
    try {
      const [manifest, topology, index] = await Promise.all([
        reader.readManifest(),
        reader.readTopology(),
        reader.readIndex(),
      ]);
      this.reader = reader;
      this.info = { manifest, topology, index };
      return this.info;
    } catch (error) {
      await reader.close();
      throw error;
    }
  }

  async seek(
    timeDomain: string,
    cycle: DecimalU64,
    requestId: number,
  ): Promise<SerializedSimTraceSnapshot> {
    const reader = this.requireReader();
    if (!validRequestId(requestId)) {
      throw new TypeError("seek requestId must be a non-negative safe integer");
    }
    if (requestId <= this.latestRequestId) {
      throw new SeekSupersededError(requestId, this.latestRequestId);
    }
    this.latestRequestId = requestId;
    this.activeSeek?.abort();
    const controller = new AbortController();
    this.activeSeek = controller;
    try {
      const snapshot = await seekToCycle(
        reader,
        timeDomain,
        cycle,
        controller.signal,
      );
      if (requestId !== this.latestRequestId) {
        throw new SeekSupersededError(requestId, this.latestRequestId);
      }
      return serializeSimTraceSnapshot(snapshot);
    } catch (error) {
      if (controller.signal.aborted || requestId !== this.latestRequestId) {
        throw new SeekSupersededError(requestId, this.latestRequestId);
      }
      throw error;
    } finally {
      if (this.activeSeek === controller) this.activeSeek = undefined;
    }
  }

  async eventsAt(
    timeDomain: string,
    cycle: DecimalU64,
  ): Promise<readonly SimTraceEvent[]> {
    return this.eventsInRange(timeDomain, cycle, cycle);
  }

  async entityHistory(
    timeDomain: string,
    entityId: string,
    from: DecimalU64,
    to: DecimalU64,
  ): Promise<readonly SimTraceEvent[]> {
    if (BigInt(to) < BigInt(from)) {
      throw new RangeError("entity history range is reversed");
    }
    return (await this.eventsInRange(timeDomain, from, to)).filter(
      (event) => event.entityId === entityId,
    );
  }

  private async eventsInRange(
    timeDomain: string,
    from: DecimalU64,
    to: DecimalU64,
  ): Promise<readonly SimTraceEvent[]> {
    const reader = this.requireReader();
    const info = this.requireInfo();
    const chunks = info.index.chunks.filter(
      (chunk) =>
        chunk.timeDomain === timeDomain &&
        BigInt(chunk.lastCycle) >= BigInt(from) &&
        BigInt(chunk.firstCycle) <= BigInt(to),
    );
    const events = (
      await Promise.all(chunks.map((chunk) => reader.readChunk(chunk)))
    ).flat();
    return events.filter(
      (event) =>
        event.timeDomain === timeDomain && within(event.cycle, from, to),
    );
  }

  private requireReader(): TraceBundleReaderInterface {
    if (!this.reader) throw new Error("trace worker has no loaded bundle");
    return this.reader;
  }

  private requireInfo(): LoadedTraceInfo {
    if (!this.info) throw new Error("trace worker has no loaded bundle");
    return this.info;
  }

  async close(): Promise<void> {
    this.activeSeek?.abort();
    this.activeSeek = undefined;
    this.latestRequestId = -1;
    const reader = this.reader;
    this.reader = undefined;
    this.info = undefined;
    await reader?.close();
  }
}
