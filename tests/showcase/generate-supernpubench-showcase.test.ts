import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { buildShowcasePlan } from "../../scripts/generate-supernpubench-showcase.mjs";

const roots = {
  cityRoot: "/workspace/LinxSimCity",
  modelRoot: "/workspace/SuperScalarModel",
  benchRoot: "/workspace/supernpubench",
  outputRoot: "/workspace/output",
};

describe("SuperNPUBench showcase plan", () => {
  test("runs the official matmul to completion and bounds only FA", () => {
    const plan = buildShowcasePlan(roots);

    expect(plan.workloads.map((workload) => workload.name)).toEqual([
      "matmul",
      "fa-250-blocks",
    ]);
    expect(plan.workloads[0]?.args).not.toContain("-m");
    expect(plan.workloads[1]?.args).toEqual(
      expect.arrayContaining(["-m", "250"]),
    );
    expect(plan.workloads[0]?.elf).toBe(
      resolve(
        roots.benchRoot,
        "kernel/matmul/elf/kernel_matmul/matmul_MASK_MASK_FP32_M256_N256_K256_tM32_tN32_tK32.elf",
      ),
    );
    expect(plan.workloads[1]?.elf).toBe(
      resolve(
        roots.benchRoot,
        "kernel/fa/elf/kernel_fa/sfa_Sq256_Skv512_Tm16_Tk32.elf",
      ),
    );
  });

  test("enables pipeline tracing and validates both directory and ZIP forms", () => {
    const plan = buildShowcasePlan(roots);

    for (const workload of plan.workloads) {
      expect(workload.args).toEqual(
        expect.arrayContaining([
          "core.deadlock_cycles=100000",
          "trace.linx_enable=true",
          "trace.linx_profile=pipeline",
          `trace.linx_output=${workload.traceDirectory}`,
        ]),
      );
      expect(workload.validationTargets).toEqual([
        workload.traceDirectory,
        workload.archive,
      ]);
    }
  });
});
