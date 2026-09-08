import { WORKLOADS } from "./catalog.js";
import { hashRunConfiguration, parseRunConfiguration } from "./config.js";
import type {
  ChallengeDefinition,
  ChallengeEvaluation,
  ChallengeId,
  ChallengeRunEvidence,
  ObservableRunMetrics,
  RunConfiguration,
} from "./types.js";

const BACKEND_NAME = "SuperScalarModel";
const WORKLOAD_ID = "supernpubench-matmul-fp32-m256-n256-k256";
const TOPOLOGY_FINGERPRINT = "fnv1a64:ea6a74eb2b796df5";
const ALL_TRACE_CAPABILITIES = [
  "queue-lifecycle",
  "tile-residency",
  "instruction-link",
  "compute-lifecycle",
] as const;

function configuration(
  scenarioId: "normal" | "bank-conflict",
  cubeMaxBankPerCycle: number,
): RunConfiguration {
  return {
    schema: "linxsimcity.run-config",
    schemaVersion: "1",
    backendId: "superscalar-model",
    workloadId: WORKLOAD_ID,
    scenarioId,
    parameters: {
      cellPerfectMode: scenarioId === "normal",
      cubeMaxBankPerCycle,
    },
  };
}

const NORMAL_CONFIGURATION = configuration("normal", 4);
const CONFLICT_CONFIGURATION = configuration("bank-conflict", 1);

export const CHALLENGES = Object.freeze({
  "explain-topology": {
    id: "explain-topology",
    label: "Explain the traced topology",
    objective:
      "Follow the fixed LSU → Tile Load Queue → TMA path and relate Tile storage to Cube compute.",
    backendId: "superscalar-model",
    workloadId: WORKLOAD_ID,
    workloadSha256: WORKLOADS[WORKLOAD_ID].defaultSha256,
    topologyFingerprint: TOPOLOGY_FINGERPRINT,
    initialConfiguration: NORMAL_CONFIGURATION,
    allowedParameters: [],
    requiredTraceCapabilities: ALL_TRACE_CAPABILITIES,
    steps: [
      "Load the fixed normal run and verify its workload and topology binding.",
      "Follow queue.tload from source.lsu to tma.bridge.",
      "Select an associated Tile and locate its bank/row/slot in sram.tile.",
      "Follow that Tile to compute.cube and compare the measured run cycles and Tile transfers.",
    ],
    observableMetrics: ["cycles", "tileTransferCount"],
    completion: {
      kind: "evidence",
      requiredMetrics: ["cycles", "tileTransferCount"],
      description:
        "A complete, lossless, correctly bound run exposes all four trace capabilities and measured cycle/Tile-transfer totals.",
    },
  },
  "find-queue-bottleneck": {
    id: "find-queue-bottleneck",
    label: "Locate Queue backpressure",
    objective:
      "Use the real-arbitration run to prove that queue.tload stalls and quantify the resulting waits.",
    backendId: "superscalar-model",
    workloadId: WORKLOAD_ID,
    workloadSha256: WORKLOADS[WORKLOAD_ID].defaultSha256,
    topologyFingerprint: TOPOLOGY_FINGERPRINT,
    initialConfiguration: CONFLICT_CONFIGURATION,
    allowedParameters: [],
    requiredTraceCapabilities: ["queue-lifecycle", "instruction-link"],
    steps: [
      "Run the fixed real-arbitration configuration.",
      "Inspect queue.tload backpressure and follow a blocked token to its associated Tile.",
      "Report measured Queue backpressure cycles and wait cycles from the bound result.",
    ],
    observableMetrics: ["cycles", "queueBackpressureCycles", "waitCycles"],
    completion: {
      kind: "positive-metrics",
      requiredMetrics: ["cycles", "queueBackpressureCycles", "waitCycles"],
      description:
        "The bound run reports non-zero Queue backpressure and wait cycles.",
    },
  },
  "reduce-bank-conflicts": {
    id: "reduce-bank-conflicts",
    label: "Reduce bank conflicts",
    objective:
      "Increase real CellReg bank service parallelism, rerun the same workload/topology, and measure the improvement.",
    backendId: "superscalar-model",
    workloadId: WORKLOAD_ID,
    workloadSha256: WORKLOADS[WORKLOAD_ID].defaultSha256,
    topologyFingerprint: TOPOLOGY_FINGERPRINT,
    initialConfiguration: CONFLICT_CONFIGURATION,
    allowedParameters: [
      {
        parameter: "cellPerfectMode",
        type: "boolean",
        values: [false],
      },
      {
        parameter: "cubeMaxBankPerCycle",
        type: "integer",
        minimum: 2,
        maximum: 8,
      },
    ],
    requiredTraceCapabilities: ["tile-residency", "compute-lifecycle"],
    steps: [
      "Record the fixed one-bank real-arbitration baseline.",
      "Set cubeMaxBankPerCycle to 2–8 while keeping cellPerfectMode false.",
      "Export the changed configuration and rerun it; the old run becomes stale.",
      "Compare only results with identical workload and topology bindings.",
      "Confirm measured bank-conflict cycles fall by at least 10% and total cycles also fall.",
    ],
    observableMetrics: [
      "cycles",
      "bankConflictCycles",
      "waitCycles",
      "tileTransferCount",
    ],
    completion: {
      kind: "relative-improvement",
      requiredMetrics: ["cycles", "bankConflictCycles"],
      minimumReductionPercent: 10,
      mustReduceCycles: true,
      description:
        "Against the fixed one-bank baseline, measured bank-conflict cycles fall by at least 10% and total cycles decrease.",
    },
  },
} satisfies Record<ChallengeId, ChallengeDefinition>);

function result(
  challengeId: ChallengeId,
  status: ChallengeEvaluation["status"],
  diagnostics: readonly string[],
  metrics?: ObservableRunMetrics,
): ChallengeEvaluation {
  return {
    challengeId,
    status,
    diagnostics,
    observed: metrics?.values ?? {},
  };
}

function decimalU64(value: string | undefined): bigint | undefined {
  if (value === undefined || !/^(0|[1-9][0-9]*)$/.test(value)) return undefined;
  const parsed = BigInt(value);
  return parsed <= 18_446_744_073_709_551_615n ? parsed : undefined;
}

function allowedCandidateConfiguration(
  configuration: RunConfiguration,
): boolean {
  return (
    configuration.backendId === "superscalar-model" &&
    configuration.workloadId === WORKLOAD_ID &&
    configuration.scenarioId === "bank-conflict" &&
    configuration.parameters.cellPerfectMode === false &&
    typeof configuration.parameters.cubeMaxBankPerCycle === "number" &&
    configuration.parameters.cubeMaxBankPerCycle >= 2 &&
    configuration.parameters.cubeMaxBankPerCycle <= 8
  );
}

function inspectEvidence(
  challenge: ChallengeDefinition,
  evidence: ChallengeRunEvidence,
  expectedConfiguration: "initial" | "improved",
): ChallengeEvaluation | undefined {
  let parsed: RunConfiguration;
  try {
    parsed = parseRunConfiguration(evidence.configuration);
  } catch (error) {
    return result(challenge.id, "unsupported-run", [
      `invalid run configuration: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }

  if (
    parsed.backendId !== challenge.backendId ||
    evidence.manifest.simulator.name !== BACKEND_NAME
  ) {
    return result(challenge.id, "unsupported-run", [
      `challenge requires backend ${challenge.backendId}`,
    ]);
  }
  if (
    parsed.workloadId !== challenge.workloadId ||
    evidence.manifest.workload.name !==
      WORKLOADS[challenge.workloadId].simulatorName ||
    evidence.manifest.workload.sha256 !== challenge.workloadSha256
  ) {
    return result(challenge.id, "incomparable-run", [
      "run workload does not match the challenge workload",
    ]);
  }
  if (evidence.manifest.topologyFingerprint !== challenge.topologyFingerprint) {
    return result(challenge.id, "incomparable-run", [
      "run topology does not match the challenge topology",
    ]);
  }

  const actualConfigSha256 = hashRunConfiguration(parsed);
  if (evidence.manifest.simulator.configSha256 !== actualConfigSha256) {
    return result(challenge.id, "stale-run", [
      "run config hash is stale; rerun the exported configuration",
    ]);
  }
  if (
    expectedConfiguration === "initial" &&
    actualConfigSha256 !== hashRunConfiguration(challenge.initialConfiguration)
  ) {
    return result(challenge.id, "unsupported-run", [
      "run does not use the fixed challenge configuration",
    ]);
  }
  if (
    expectedConfiguration === "improved" &&
    !allowedCandidateConfiguration(parsed)
  ) {
    return result(challenge.id, "unsupported-run", [
      "improved run parameters are outside the challenge range",
    ]);
  }
  if (
    !evidence.manifest.window.complete ||
    evidence.manifest.loss.truncated ||
    evidence.manifest.loss.droppedEvents !== "0"
  ) {
    return result(challenge.id, "insufficient-evidence", [
      "challenge requires a complete, lossless run",
    ]);
  }

  const missingCapability = challenge.requiredTraceCapabilities.find(
    (capability) => !evidence.manifest.capabilities.includes(capability),
  );
  if (missingCapability) {
    return result(challenge.id, "insufficient-evidence", [
      `run is missing trace capability ${missingCapability}`,
    ]);
  }
  if (!evidence.metrics) {
    return result(challenge.id, "insufficient-evidence", [
      "run manifest has no bound observable metrics; PMU/trace metrics are required",
    ]);
  }
  const metrics = evidence.metrics;
  if (
    metrics.schema !== "linxsimcity.run-metrics" ||
    metrics.schemaVersion !== "1" ||
    metrics.runId !== evidence.manifest.runId ||
    metrics.configSha256 !== actualConfigSha256 ||
    metrics.topologyFingerprint !== evidence.manifest.topologyFingerprint ||
    metrics.workloadSha256 !== evidence.manifest.workload.sha256
  ) {
    return result(challenge.id, "insufficient-evidence", [
      "observable metrics are not bound to this run",
    ]);
  }
  const invalidMetric = challenge.completion.requiredMetrics.find(
    (metric) => decimalU64(metrics.values[metric]) === undefined,
  );
  if (invalidMetric) {
    return result(
      challenge.id,
      "insufficient-evidence",
      [`required metric ${invalidMetric} is missing or is not a decimal u64`],
      metrics,
    );
  }
  return undefined;
}

export function evaluateChallenge(
  challengeId: Exclude<ChallengeId, "reduce-bank-conflicts">,
  evidence: ChallengeRunEvidence,
): ChallengeEvaluation {
  const challenge = CHALLENGES[challengeId];
  const diagnostic = inspectEvidence(challenge, evidence, "initial");
  if (diagnostic) return diagnostic;
  const metrics = evidence.metrics!;
  if (challenge.completion.kind === "positive-metrics") {
    const empty = challenge.completion.requiredMetrics.filter(
      (metric) => decimalU64(metrics.values[metric]) === 0n,
    );
    if (empty.length > 0) {
      return result(
        challengeId,
        "incomplete",
        [`required metrics must be non-zero: ${empty.join(", ")}`],
        metrics,
      );
    }
  }
  return result(challengeId, "complete", [], metrics);
}

export function evaluateImprovementChallenge(
  baseline: ChallengeRunEvidence,
  improved: ChallengeRunEvidence,
): ChallengeEvaluation {
  const challenge = CHALLENGES["reduce-bank-conflicts"];
  const baselineDiagnostic = inspectEvidence(challenge, baseline, "initial");
  if (baselineDiagnostic) return baselineDiagnostic;
  const improvedDiagnostic = inspectEvidence(challenge, improved, "improved");
  if (improvedDiagnostic) return improvedDiagnostic;

  if (
    baseline.manifest.workload.sha256 !== improved.manifest.workload.sha256 ||
    baseline.manifest.topologyFingerprint !==
      improved.manifest.topologyFingerprint
  ) {
    return result(challenge.id, "incomparable-run", [
      "baseline and improved runs must use the same workload and topology",
    ]);
  }

  const baselineMetrics = baseline.metrics!;
  const improvedMetrics = improved.metrics!;
  const baselineConflicts = decimalU64(
    baselineMetrics.values.bankConflictCycles,
  )!;
  const improvedConflicts = decimalU64(
    improvedMetrics.values.bankConflictCycles,
  )!;
  const baselineCycles = decimalU64(baselineMetrics.values.cycles)!;
  const improvedCycles = decimalU64(improvedMetrics.values.cycles)!;
  const reduction = challenge.completion.minimumReductionPercent!;
  const conflictTargetMet =
    improvedConflicts * 100n <= baselineConflicts * BigInt(100 - reduction);
  const cycleTargetMet = improvedCycles < baselineCycles;
  if (!conflictTargetMet || !cycleTargetMet) {
    return result(
      challenge.id,
      "incomplete",
      [
        !conflictTargetMet
          ? `bank-conflict reduction is below ${reduction}%`
          : "total cycles did not decrease",
      ],
      improvedMetrics,
    );
  }
  return result(challenge.id, "complete", [], improvedMetrics);
}
