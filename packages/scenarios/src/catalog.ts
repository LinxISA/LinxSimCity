import type {
  BackendDefinition,
  ScenarioDefinition,
  WorkloadDefinition,
} from "./types.js";

export const BACKENDS = Object.freeze({
  "superscalar-model": {
    id: "superscalar-model",
    label: "SuperScalarModel",
    executable: "gfsim",
  },
} satisfies Record<string, BackendDefinition>);

export const WORKLOADS = Object.freeze({
  "supernpubench-matmul-fp32-m256-n256-k256": {
    id: "supernpubench-matmul-fp32-m256-n256-k256",
    label: "SuperNPUBench FP32 matmul M256 N256 K256",
    simulatorName: "supernpubench-matmul-fp32-m256-n256-k256",
    defaultSha256:
      "4c3a93ec7394b3a159dcdaab4457a95c4f0be1b49d77bae8661b67e24ca93928",
  },
} satisfies Record<string, WorkloadDefinition>);

const CELL_PARAMETERS = Object.freeze({
  cellPerfectMode: {
    type: "boolean",
    configKey: "cell.perfect_mode",
    label: "Perfect CellReg arbitration",
  },
  cubeMaxBankPerCycle: {
    type: "integer",
    configKey: "cell.cube_max_bank_per_cycle",
    label: "Cube CellReg banks serviced per cycle",
    minimum: 1,
    maximum: 8,
  },
} as const);

export const SCENARIOS = Object.freeze({
  normal: {
    id: "normal",
    label: "Normal arbitration",
    description:
      "Perfect CellReg service baseline for the pinned matmul workload.",
    backendId: "superscalar-model",
    workloadId: "supernpubench-matmul-fp32-m256-n256-k256",
    parameters: CELL_PARAMETERS,
    defaults: { cellPerfectMode: true, cubeMaxBankPerCycle: 4 },
  },
  "bank-conflict": {
    id: "bank-conflict",
    label: "Bank conflict",
    description:
      "Real CellReg arbitration with one Cube bank serviced per cycle.",
    backendId: "superscalar-model",
    workloadId: "supernpubench-matmul-fp32-m256-n256-k256",
    parameters: CELL_PARAMETERS,
    defaults: { cellPerfectMode: false, cubeMaxBankPerCycle: 1 },
  },
} satisfies Record<string, ScenarioDefinition>);
