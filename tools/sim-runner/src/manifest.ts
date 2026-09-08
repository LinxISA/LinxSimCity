import { validateTraceBundle } from "@linxsimcity/simtrace";
import type {
  ObservableMetricId,
  ObservableRunMetrics,
} from "@linxsimcity/scenarios";

import type { SimulationJobResult } from "./types.js";

export async function validateResultBundle(
  bundlePath: string,
  expected: {
    readonly runId: string;
    readonly simulatorRevision: string;
    readonly configSha256: string;
    readonly workloadName: string;
    readonly workloadSha256: string;
  },
  pmuOutput = "",
): Promise<SimulationJobResult> {
  const validation = validateTraceBundle(bundlePath);
  if (validation.diagnostics.length > 0) {
    const first = validation.diagnostics[0]!;
    throw new Error(
      `simtrace ${first.code} at ${first.path}: ${first.message}`,
    );
  }
  const source = validation.manifest;
  const actual = {
    runId: source.runId,
    topologyFingerprint: source.topologyFingerprint,
    simulatorRevision: source.simulator.revision,
    configSha256: source.simulator.configSha256,
    workloadName: source.workload.name,
    workloadSha256: source.workload.sha256,
  };
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    if (actual[key] !== expected[key]) {
      throw new Error(
        `manifest ${key} binding mismatch: expected ${expected[key]}, received ${actual[key]}`,
      );
    }
  }
  const values: Partial<Record<ObservableMetricId, string>> = {
    cycles: source.window.lastCycle,
    queueBackpressureCycles: String(
      validation.events.filter((event) => event.type === "queue.backpressure")
        .length,
    ),
    tileTransferCount: String(
      validation.events.filter(
        (event) =>
          event.type === "tile.read" ||
          event.type === "tile.write" ||
          event.type === "tile.move",
      ).length,
    ),
  };
  const bankConflictCycles = finalPmuValue(
    pmuOutput,
    /Bank Conflict Cycles[^\r\n]*?:\s*([0-9]+)/gu,
  );
  const waitCycles = finalPmuValue(
    pmuOutput,
    /Bank Lose \(non-winner waits\) Total[^\r\n]*?:\s*([0-9]+)/gu,
  );
  if (bankConflictCycles !== undefined) {
    values.bankConflictCycles = bankConflictCycles;
  }
  if (waitCycles !== undefined) values.waitCycles = waitCycles;
  const metrics: ObservableRunMetrics = {
    schema: "linxsimcity.run-metrics",
    schemaVersion: "1",
    source:
      bankConflictCycles !== undefined || waitCycles !== undefined
        ? "validated-trace-and-simulator-pmu"
        : "validated-trace-aggregate",
    runId: actual.runId,
    configSha256: actual.configSha256,
    topologyFingerprint: actual.topologyFingerprint,
    workloadSha256: actual.workloadSha256,
    values,
  };
  return {
    bundlePath,
    bundleBaseUrl: `/jobs/${expected.runId}/bundle/`,
    metrics,
    manifest: actual,
  };
}

function finalPmuValue(output: string, pattern: RegExp): string | undefined {
  let value: string | undefined;
  for (const match of output.matchAll(pattern)) {
    value = BigInt(match[1]!).toString();
  }
  return value;
}
