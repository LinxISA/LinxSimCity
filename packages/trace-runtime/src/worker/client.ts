import type { DecimalU64, SimTraceEvent } from "@linxsimcity/trace-schema";
import { wrap, type Remote } from "comlink";

import {
  normalizeWorkerError,
  SeekSupersededError,
  TraceClientError,
} from "./errors.js";
import type {
  LoadedTraceInfo,
  SerializedSimTraceSnapshot,
  TraceWorkerApi,
  WorkerTraceSource,
} from "./protocol.js";

export class TraceWorkerClient implements TraceWorkerApi {
  private constructor(
    private readonly api: TraceWorkerApi | Remote<TraceWorkerApi>,
    private readonly terminate?: () => void,
  ) {}

  static inProcess(api: TraceWorkerApi): TraceWorkerClient {
    return new TraceWorkerClient(api);
  }

  static spawn(): TraceWorkerClient {
    const worker = new Worker(
      new URL("./trace-worker-entry.js", import.meta.url),
      {
        type: "module",
        name: "linxsimcity-trace-runtime",
      },
    );
    return new TraceWorkerClient(wrap<TraceWorkerApi>(worker), () =>
      worker.terminate(),
    );
  }

  private async invoke<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SeekSupersededError) throw error;
      const diagnostic = normalizeWorkerError(error);
      if (diagnostic.code === "seek_superseded") {
        const details = diagnostic.details as
          { requestId?: number; latestRequestId?: number } | undefined;
        throw new SeekSupersededError(
          details?.requestId ?? -1,
          details?.latestRequestId ?? -1,
        );
      }
      throw new TraceClientError(diagnostic);
    }
  }

  load(source: WorkerTraceSource): Promise<LoadedTraceInfo> {
    return this.invoke(() => this.api.load(source));
  }

  seek(
    timeDomain: string,
    cycle: DecimalU64,
    requestId: number,
  ): Promise<SerializedSimTraceSnapshot> {
    return this.invoke(() => this.api.seek(timeDomain, cycle, requestId));
  }

  eventsAt(
    timeDomain: string,
    cycle: DecimalU64,
  ): Promise<readonly SimTraceEvent[]> {
    return this.invoke(() => this.api.eventsAt(timeDomain, cycle));
  }

  entityHistory(
    timeDomain: string,
    entityId: string,
    from: DecimalU64,
    to: DecimalU64,
  ): Promise<readonly SimTraceEvent[]> {
    return this.invoke(() =>
      this.api.entityHistory(timeDomain, entityId, from, to),
    );
  }

  async close(): Promise<void> {
    try {
      await this.api.close();
    } finally {
      this.terminate?.();
    }
  }
}
