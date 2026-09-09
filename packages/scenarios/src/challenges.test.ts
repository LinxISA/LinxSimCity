import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  CHALLENGES,
  evaluateChallenge,
  evaluateImprovementChallenge,
  hashRunConfiguration,
  type ChallengeRunEvidence,
  type ObservableRunMetrics,
  type RunConfiguration,
} from "./index.js";

const CAPABILITIES = [
  "queue-lifecycle",
  "tile-residency",
  "instruction-link",
  "compute-lifecycle",
] as const;

function run(
  configuration: RunConfiguration,
  values?: ObservableRunMetrics["values"],
): ChallengeRunEvidence {
  const configSha256 = hashRunConfiguration(configuration);
  const manifest = {
    runId: `run-${configSha256.slice(0, 8)}`,
    topologyFingerprint: CHALLENGES["explain-topology"].topologyFingerprint,
    simulator: { name: "SuperScalarModel", configSha256 },
    workload: {
      name: "supernpubench-matmul-fp32-m256-n256-k256",
      sha256: CHALLENGES["explain-topology"].workloadSha256,
    },
    window: { complete: true },
    capabilities: CAPABILITIES,
    loss: { droppedEvents: "0", truncated: false },
  };
  return {
    configuration,
    manifest,
    ...(values
      ? {
          metrics: {
            schema: "linxsimcity.run-metrics" as const,
            schemaVersion: "1" as const,
            source: "simulator-pmu" as const,
            runId: manifest.runId,
            configSha256,
            topologyFingerprint: manifest.topologyFingerprint,
            workloadSha256: manifest.workload.sha256,
            values,
          },
        }
      : {}),
  };
}

function candidate(banks: number): RunConfiguration {
  return {
    ...CHALLENGES["reduce-bank-conflicts"].initialConfiguration,
    parameters: {
      cellPerfectMode: false,
      cubeMaxBankPerCycle: banks,
    },
  };
}

function recordedEvidence(
  bundle: string,
  configuration: RunConfiguration,
): ChallengeRunEvidence {
  const root = new URL(
    `../../../apps/game/public/runs/${bundle}/`,
    import.meta.url,
  );
  return {
    configuration,
    manifest: JSON.parse(
      readFileSync(new URL("manifest.json", root), "utf8"),
    ) as ChallengeRunEvidence["manifest"],
    metrics: JSON.parse(
      readFileSync(new URL("metrics.json", root), "utf8"),
    ) as ObservableRunMetrics,
  };
}

describe("guided challenge catalog", () => {
  test("declares three fixed and independently testable challenges", () => {
    expect(Object.keys(CHALLENGES)).toEqual([
      "explain-topology",
      "find-queue-bottleneck",
      "reduce-bank-conflicts",
    ]);
    for (const challenge of Object.values(CHALLENGES)) {
      expect(challenge.backendId).toBe("superscalar-model");
      expect(challenge.workloadSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(challenge.topologyFingerprint).toMatch(/^fnv1a64:[a-f0-9]{16}$/);
      expect(challenge.steps.length).toBeGreaterThan(1);
      expect(challenge.completion.requiredMetrics.length).toBeGreaterThan(0);
    }
    expect(CHALLENGES["reduce-bank-conflicts"].allowedParameters).toEqual([
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
    ]);
  });
});

describe("single-run challenge evaluation", () => {
  test("completes topology explanation only with bound measured evidence", () => {
    const evaluation = evaluateChallenge(
      "explain-topology",
      run(CHALLENGES["explain-topology"].initialConfiguration, {
        cycles: "49822",
        tileTransferCount: "100000",
      }),
    );
    expect(evaluation).toMatchObject({ status: "complete", diagnostics: [] });
  });

  test("does not guess metrics from a current bundle manifest", () => {
    const evaluation = evaluateChallenge(
      "explain-topology",
      run(CHALLENGES["explain-topology"].initialConfiguration),
    );
    expect(evaluation).toMatchObject({
      status: "insufficient-evidence",
      diagnostics: [expect.stringMatching(/no bound observable metrics/)],
    });
  });

  test("rejects a missing required metric", () => {
    const evaluation = evaluateChallenge(
      "find-queue-bottleneck",
      run(CHALLENGES["find-queue-bottleneck"].initialConfiguration, {
        cycles: "68785",
        queueBackpressureCycles: "10725",
      }),
    );
    expect(evaluation).toMatchObject({
      status: "insufficient-evidence",
      diagnostics: [expect.stringMatching(/waitCycles is missing/)],
    });
  });

  test("requires positive Queue backpressure and waits", () => {
    const incomplete = evaluateChallenge(
      "find-queue-bottleneck",
      run(CHALLENGES["find-queue-bottleneck"].initialConfiguration, {
        cycles: "68785",
        queueBackpressureCycles: "0",
        waitCycles: "0",
      }),
    );
    expect(incomplete.status).toBe("incomplete");

    const complete = evaluateChallenge(
      "find-queue-bottleneck",
      run(CHALLENGES["find-queue-bottleneck"].initialConfiguration, {
        cycles: "68785",
        queueBackpressureCycles: "10725",
        waitCycles: "815151",
      }),
    );
    expect(complete.status).toBe("complete");
  });

  test("marks an old result stale after configuration changes", () => {
    const changed = candidate(2);
    const evidence = run(changed, {
      cycles: "60000",
      bankConflictCycles: "300000",
    });
    const stale = {
      ...evidence,
      manifest: {
        ...evidence.manifest,
        simulator: {
          ...evidence.manifest.simulator,
          configSha256: hashRunConfiguration(
            CHALLENGES["reduce-bank-conflicts"].initialConfiguration,
          ),
        },
      },
    };
    expect(
      evaluateImprovementChallenge(
        run(CHALLENGES["reduce-bank-conflicts"].initialConfiguration, {
          cycles: "68785",
          bankConflictCycles: "362905",
        }),
        stale,
      ),
    ).toMatchObject({ status: "stale-run" });
  });
});

describe("bank-conflict improvement comparison", () => {
  const baseline = () =>
    run(CHALLENGES["reduce-bank-conflicts"].initialConfiguration, {
      cycles: "1000",
      bankConflictCycles: "1000",
      waitCycles: "2000",
      tileTransferCount: "400",
    });

  test("compares only the same workload and topology", () => {
    const workloadMismatch = run(candidate(4), {
      cycles: "800",
      bankConflictCycles: "800",
    });
    const otherWorkload = {
      ...workloadMismatch,
      manifest: {
        ...workloadMismatch.manifest,
        workload: {
          ...workloadMismatch.manifest.workload,
          sha256: "f".repeat(64),
        },
      },
    };
    expect(
      evaluateImprovementChallenge(baseline(), otherWorkload),
    ).toMatchObject({ status: "incomparable-run" });

    const topologyMismatch = run(candidate(4), {
      cycles: "800",
      bankConflictCycles: "800",
    });
    const otherTopology = {
      ...topologyMismatch,
      manifest: {
        ...topologyMismatch.manifest,
        topologyFingerprint: "fnv1a64:0000000000000000",
      },
    };
    expect(
      evaluateImprovementChallenge(baseline(), otherTopology),
    ).toMatchObject({ status: "incomparable-run" });
  });

  test("enforces the allowed candidate parameter range", () => {
    expect(
      evaluateImprovementChallenge(
        baseline(),
        run(candidate(1), { cycles: "800", bankConflictCycles: "800" }),
      ),
    ).toMatchObject({ status: "unsupported-run" });
  });

  test("accepts the exact 10% reduction threshold when cycles improve", () => {
    expect(
      evaluateImprovementChallenge(
        baseline(),
        run(candidate(4), { cycles: "999", bankConflictCycles: "900" }),
      ),
    ).toMatchObject({ status: "complete" });
  });

  test("rejects a reduction below threshold or unchanged total cycles", () => {
    expect(
      evaluateImprovementChallenge(
        baseline(),
        run(candidate(4), { cycles: "999", bankConflictCycles: "901" }),
      ),
    ).toMatchObject({
      status: "incomplete",
      diagnostics: [expect.stringMatching(/below 10%/)],
    });
    expect(
      evaluateImprovementChallenge(
        baseline(),
        run(candidate(4), { cycles: "1000", bankConflictCycles: "800" }),
      ),
    ).toMatchObject({
      status: "incomplete",
      diagnostics: [expect.stringMatching(/cycles did not decrease/)],
    });
  });
});

test("the three pinned recorded evidence sets complete their challenges", () => {
  const normal = recordedEvidence(
    "superscalar-matmul.bundle",
    CHALLENGES["explain-topology"].initialConfiguration,
  );
  const conflict = recordedEvidence(
    "superscalar-matmul-conflict.bundle",
    CHALLENGES["reduce-bank-conflicts"].initialConfiguration,
  );
  const improved = recordedEvidence(
    "superscalar-matmul-improved.bundle",
    candidate(2),
  );
  expect(evaluateChallenge("explain-topology", normal).status).toBe("complete");
  expect(evaluateChallenge("find-queue-bottleneck", conflict).status).toBe(
    "complete",
  );
  expect(evaluateImprovementChallenge(conflict, improved).status).toBe(
    "complete",
  );
});
