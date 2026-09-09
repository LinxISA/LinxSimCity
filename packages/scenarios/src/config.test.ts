import { describe, expect, test } from "vitest";

import {
  createRunConfiguration,
  exportRunConfiguration,
  parseRunConfiguration,
  sha256Text,
} from "./index.js";

describe("typed run scenarios", () => {
  test("uses a browser-safe SHA-256 implementation", () => {
    expect(sha256Text("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  test("exports a deterministic normal configuration and digest", () => {
    const configuration = createRunConfiguration({
      backendId: "superscalar-model",
      workloadId: "supernpubench-matmul-fp32-m256-n256-k256",
      scenarioId: "normal",
    });
    const first = exportRunConfiguration(configuration);
    const second = exportRunConfiguration(structuredClone(configuration));
    expect(first).toEqual(second);
    expect(first.configSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.simulatorOverrides).toEqual([
      "cell.cube_max_bank_per_cycle=4",
      "cell.perfect_mode=true",
    ]);
  });

  test("provides a real-arbitration bank-conflict preset", () => {
    const exported = exportRunConfiguration(
      createRunConfiguration({
        backendId: "superscalar-model",
        workloadId: "supernpubench-matmul-fp32-m256-n256-k256",
        scenarioId: "bank-conflict",
      }),
    );
    expect(exported.simulatorOverrides).toEqual([
      "cell.cube_max_bank_per_cycle=1",
      "cell.perfect_mode=false",
    ]);
  });

  test.each([
    ["unknown backend", { backendId: "../gfsim" }, /allowlisted identifier/],
    [
      "unknown workload",
      { workloadId: "other-workload" },
      /unsupported workload/,
    ],
    ["unknown scenario", { scenarioId: "shell" }, /unsupported scenario/],
    ["unknown key", { parameters: { command: "rm" } }, /not supported/],
    [
      "null value",
      { parameters: { cellPerfectMode: null } },
      /must be boolean/,
    ],
    [
      "low range",
      { parameters: { cubeMaxBankPerCycle: 0 } },
      /between 1 and 8/,
    ],
    [
      "high range",
      { parameters: { cubeMaxBankPerCycle: 9 } },
      /between 1 and 8/,
    ],
  ])("rejects %s", (_name, mutation, expected) => {
    const source = {
      schema: "linxsimcity.run-config",
      schemaVersion: "1",
      backendId: "superscalar-model",
      workloadId: "supernpubench-matmul-fp32-m256-n256-k256",
      scenarioId: "normal",
      parameters: {},
      ...mutation,
    };
    expect(() => parseRunConfiguration(source)).toThrow(expected as RegExp);
  });
});
