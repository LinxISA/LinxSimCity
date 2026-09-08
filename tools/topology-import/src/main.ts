#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  convertAgenticQueuePlan,
  parseAgenticQueuePlan,
} from "./queue-plan.js";

function usage(): never {
  throw new Error(
    "usage: linxtopology queue-plan <plan.json> --model <model.py> --repository <url> --revision <sha> --output <topology.json> [--worktree-dirty] [--relevant-inputs-dirty]",
  );
}

function option(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) usage();
  return value;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function main(): void {
  const args = process.argv.slice(2);
  if (args[0] !== "queue-plan" || !args[1]) usage();
  const planPath = resolve(args[1]);
  const modelPath = resolve(option(args, "--model"));
  const outputPath = resolve(option(args, "--output"));
  const plan = parseAgenticQueuePlan(
    JSON.parse(readFileSync(planPath, "utf8")) as unknown,
  );
  const topology = convertAgenticQueuePlan(plan, {
    repository: option(args, "--repository"),
    revision: option(args, "--revision"),
    worktreeDirty: args.includes("--worktree-dirty"),
    relevantInputsDirty: args.includes("--relevant-inputs-dirty"),
    planSha256: sha256(planPath),
    modelSha256: sha256(modelPath),
  });
  writeFileSync(outputPath, `${JSON.stringify(topology, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ output: outputPath, nodes: topology.nodes.length, edges: topology.edges.length, source: topology.source })}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
