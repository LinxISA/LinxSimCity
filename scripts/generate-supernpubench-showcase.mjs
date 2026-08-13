#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";

/**
 * @typedef {object} ShowcaseRoots
 * @property {string} cityRoot
 * @property {string} modelRoot
 * @property {string} benchRoot
 * @property {string} outputRoot
 */

/**
 * @typedef {object} WorkloadPlan
 * @property {"matmul" | "fa-250-blocks"} name
 * @property {string} elf
 * @property {string} traceDirectory
 * @property {string} archive
 * @property {string} log
 * @property {string[]} args
 * @property {string[]} validationTargets
 * @property {"complete" | "bounded"} completion
 */

const MATMUL_ELF =
  "kernel/matmul/elf/kernel_matmul/matmul_MASK_MASK_FP32_M256_N256_K256_tM32_tN32_tK32.elf";
const FA_ELF = "kernel/fa/elf/kernel_fa/sfa_Sq256_Skv512_Tm16_Tk32.elf";

/** @param {ShowcaseRoots} roots */
export function buildShowcasePlan(roots) {
  const cityRoot = resolve(roots.cityRoot);
  const modelRoot = resolve(roots.modelRoot);
  const benchRoot = resolve(roots.benchRoot);
  const outputRoot = resolve(roots.outputRoot);
  const gfsim = join(modelRoot, "bin/gfsim");
  const linxtrace = join(cityRoot, "tools/linxtrace/dist/main.js");
  const provenance = resolve(outputRoot, "provenance.json");

  /**
   * @param {WorkloadPlan["name"]} name
   * @param {string} relativeElf
   * @param {WorkloadPlan["completion"]} completion
   * @param {string[]} extraArgs
   * @returns {WorkloadPlan}
   */
  const workload = (name, relativeElf, completion, extraArgs = []) => {
    const elf = resolve(benchRoot, relativeElf);
    const traceDirectory = resolve(outputRoot, `${name}.trace-dir`);
    const archive = resolve(outputRoot, `supernpubench-${name}.linxtrace`);
    return {
      name,
      elf,
      traceDirectory,
      archive,
      log: resolve(outputRoot, `${name}.gfsim.log`),
      completion,
      args: [
        "-f",
        elf,
        "--conf",
        "fourpe",
        "--pto-v02",
        "true",
        "--test-finisher",
        "true",
        ...extraArgs,
        "-s",
        "core.deadlock_cycles=100000",
        "trace.linx_enable=true",
        "trace.linx_profile=pipeline",
        `trace.linx_output=${traceDirectory}`,
      ],
      validationTargets: [traceDirectory, archive],
    };
  };

  return {
    cityRoot,
    modelRoot,
    benchRoot,
    outputRoot,
    gfsim,
    linxtrace,
    provenance,
    workloads: [
      workload("matmul", MATMUL_ELF, "complete"),
      workload("fa-250-blocks", FA_ELF, "bounded", ["-m", "250"]),
    ],
  };
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{cwd?: string, log?: string}} [options]
 */
function run(command, args, options = {}) {
  let logDescriptor;
  try {
    if (options.log) logDescriptor = openSync(options.log, "wx");
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      stdio: options.log ? ["ignore", logDescriptor, logDescriptor] : "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `${basename(command)} exited with status ${result.status ?? "unknown"}`,
      );
    }
  } finally {
    if (logDescriptor !== undefined) closeSync(logDescriptor);
  }
}

/** @param {string} repository */
function gitState(repository) {
  const revision = spawnSync("git", ["-C", repository, "rev-parse", "HEAD"], {
    encoding: "utf8",
  });
  const status = spawnSync("git", ["-C", repository, "status", "--porcelain"], {
    encoding: "utf8",
  });
  return {
    revision: revision.status === 0 ? revision.stdout.trim() : "unknown",
    dirty: status.status !== 0 || status.stdout.trim().length > 0,
  };
}

/** @param {string} path */
function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function usage() {
  return `Usage:
  npm run showcase:generate -- \\
    --model /path/to/SuperScalarModel \\
    --bench /path/to/supernpubench-root \\
    --output /path/to/output

Options:
  --city PATH    LinxSimCity checkout (default: current directory)
  --dry-run      Print the deterministic workload plan without executing it
  --help         Show this help
`;
}

/** @param {string[]} argv */
export function main(argv) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      city: { type: "string", default: process.cwd() },
      model: { type: "string" },
      bench: { type: "string" },
      output: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(usage());
    return;
  }
  if (!values.model || !values.bench || !values.output) {
    throw new Error(
      "--model, --bench, and --output are required\n\n" + usage(),
    );
  }

  const plan = buildShowcasePlan({
    cityRoot: values.city,
    modelRoot: values.model,
    benchRoot: values.bench,
    outputRoot: values.output,
  });
  if (values["dry-run"]) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }

  for (const required of [plan.gfsim]) {
    if (!existsSync(required))
      throw new Error(`required executable is missing: ${required}`);
  }
  for (const workload of plan.workloads) {
    if (!existsSync(workload.elf)) {
      throw new Error(`official workload ELF is missing: ${workload.elf}`);
    }
    for (const output of [
      workload.traceDirectory,
      workload.archive,
      workload.log,
    ]) {
      if (existsSync(output)) {
        throw new Error(
          `refusing to overwrite existing showcase output: ${output}`,
        );
      }
    }
  }
  if (existsSync(plan.provenance)) {
    throw new Error(
      `refusing to overwrite existing showcase output: ${plan.provenance}`,
    );
  }

  mkdirSync(plan.outputRoot, { recursive: true });
  run("npm", ["run", "build", "--workspace", "@linxsimcity/linxtrace"], {
    cwd: plan.cityRoot,
  });
  if (!existsSync(plan.linxtrace)) {
    throw new Error(`linxtrace build did not produce: ${plan.linxtrace}`);
  }

  for (const workload of plan.workloads) {
    process.stdout.write(`Generating ${workload.name}...\n`);
    run(plan.gfsim, workload.args, {
      cwd: plan.modelRoot,
      log: workload.log,
    });
    run("node", [plan.linxtrace, "validate", workload.traceDirectory]);
    run("node", [
      plan.linxtrace,
      "pack",
      workload.traceDirectory,
      workload.archive,
    ]);
    run("node", [plan.linxtrace, "validate", workload.archive]);
  }

  const provenance = {
    generatedAt: new Date().toISOString(),
    linxSimCitySource: gitState(plan.cityRoot),
    superScalarModelSource: gitState(plan.modelRoot),
    profile: "pipeline",
    workloads: plan.workloads.map((workload) => ({
      name: workload.name,
      completion: workload.completion,
      blockLimit: workload.name === "fa-250-blocks" ? 250 : null,
      elf: workload.elf,
      elfSha256: sha256(workload.elf),
      archive: workload.archive,
      archiveSha256: sha256(workload.archive),
    })),
    knownLimitations: [
      "The FA showcase stops after 250 model blocks. A later multi-thread BIFU publication defect in SuperScalarModel can truncate a TSTORE bundle; the bounded trace avoids presenting that invalid suffix as complete execution.",
    ],
  };
  writeFileSync(plan.provenance, `${JSON.stringify(provenance, null, 2)}\n`, {
    flag: "wx",
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}
