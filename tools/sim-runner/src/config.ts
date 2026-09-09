import { resolve } from "node:path";

import type { LocalRunnerOptions } from "./types.js";

const DEFAULT_MODEL_ROOT =
  "/Users/zhoubot/Documents/.worktrees/SuperScalarModel-linxsimcity-trace";
const DEFAULT_ELF =
  "/Users/zhoubot/Documents/supernpubench-smoke-20260807/kernel/matmul/elf/kernel_matmul/matmul_MASK_MASK_FP32_M256_N256_K256_tM32_tN32_tK32.elf";
const DEFAULT_REVISION = "2406db2944317b8d64dc05b621f37fc9a13f8c81";
const DEFAULT_ELF_SHA256 =
  "4c3a93ec7394b3a159dcdaab4457a95c4f0be1b49d77bae8661b67e24ca93928";
const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

export interface RunnerServerOptions extends LocalRunnerOptions {
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
}

function parseAllowedOrigins(source: string | undefined): string[] {
  if (source === undefined) return [...DEFAULT_ALLOWED_ORIGINS];
  return source
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function validateOrigin(origin: string): void {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    (url.protocol !== "http:" && url.protocol !== "https:")
  ) {
    throw new Error(`runner allowed origin must be an HTTP origin: ${origin}`);
  }
}

function takeValue(
  args: readonly string[],
  index: number,
  option: string,
): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

export function parseRunnerServerOptions(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): RunnerServerOptions {
  let host = environment.LINXSIMCITY_RUNNER_HOST ?? "127.0.0.1";
  let portText = environment.LINXSIMCITY_RUNNER_PORT ?? "4317";
  let executablePath =
    environment.LINXSIMCITY_GFSIM ??
    `${DEFAULT_MODEL_ROOT}/build-current-trace/bin/gfsim`;
  let workingDirectory =
    environment.LINXSIMCITY_MODEL_DIR ?? DEFAULT_MODEL_ROOT;
  let workloadPath = environment.LINXSIMCITY_MATMUL_ELF ?? DEFAULT_ELF;
  let workloadSha256 =
    environment.LINXSIMCITY_MATMUL_SHA256 ?? DEFAULT_ELF_SHA256;
  let resultsDirectory =
    environment.LINXSIMCITY_RUNS_DIR ?? resolve(".linxsimcity/runs");
  let simulatorRevision =
    environment.LINXSIMCITY_SIMULATOR_REVISION ?? DEFAULT_REVISION;
  let allowedOrigins = parseAllowedOrigins(
    environment.LINXSIMCITY_RUNNER_ALLOWED_ORIGINS,
  );
  let commandLineOrigins = false;

  for (let index = 0; index < args.length; index += 2) {
    const option = args[index]!;
    const value = takeValue(args, index, option);
    if (option === "--host") host = value;
    else if (option === "--port") portText = value;
    else if (option === "--gfsim") executablePath = value;
    else if (option === "--model-dir") workingDirectory = value;
    else if (option === "--matmul-elf") workloadPath = value;
    else if (option === "--matmul-sha256") workloadSha256 = value;
    else if (option === "--runs-dir") resultsDirectory = value;
    else if (option === "--revision") simulatorRevision = value;
    else if (option === "--allow-origin") {
      if (!commandLineOrigins) allowedOrigins = [];
      commandLineOrigins = true;
      allowedOrigins.push(value);
    } else throw new Error(`unknown runner option: ${option}`);
  }

  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("runner port must be an integer between 0 and 65535");
  }
  if (!/^[a-f0-9]{7,64}$/.test(simulatorRevision)) {
    throw new Error("simulator revision must be a hexadecimal revision");
  }
  if (workloadSha256 && !/^[a-f0-9]{64}$/.test(workloadSha256)) {
    throw new Error("workload SHA-256 must contain 64 lowercase hex digits");
  }
  for (const origin of allowedOrigins) validateOrigin(origin);

  return {
    host,
    port,
    executablePath,
    workingDirectory,
    resultsDirectory,
    simulatorRevision,
    allowedOrigins: [...new Set(allowedOrigins)],
    workloads: {
      "supernpubench-matmul-fp32-m256-n256-k256": {
        path: workloadPath,
        ...(workloadSha256 ? { sha256: workloadSha256 } : {}),
      },
    },
  };
}
