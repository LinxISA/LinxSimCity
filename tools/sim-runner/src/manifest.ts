import { validateTraceBundle } from "@linxsimcity/simtrace";

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
  return { bundlePath, manifest: actual };
}
