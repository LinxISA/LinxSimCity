#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  convertDavinciCatalog,
  parseDavinciSourceCatalog,
} from "./davincioo-catalog.js";
import {
  convertAgenticQueuePlan,
  parseAgenticQueuePlan,
} from "./queue-plan.js";

function usage(): never {
  throw new Error(
    "usage: linxtopology <queue-plan|davincioo-catalog> <input> [command options]",
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

function importQueuePlan(args: readonly string[]): void {
  const planPath = resolve(args[1]!);
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

function importDavinciCatalog(args: readonly string[]): void {
  const catalogPath = resolve(args[1]!);
  const treePath = resolve(option(args, "--tree"));
  const outputPath = resolve(option(args, "--output"));
  const catalog = parseDavinciSourceCatalog(
    JSON.parse(readFileSync(catalogPath, "utf8")) as unknown,
  );
  const treePaths = new Set(
    readFileSync(treePath, "utf8").split(/\r?\n/).filter(Boolean),
  );
  const mapping = convertDavinciCatalog(catalog, treePaths, {
    repository: option(args, "--repository"),
    revision: option(args, "--revision"),
    catalogPath: option(args, "--catalog-path"),
    catalogSha256: sha256(catalogPath),
    treeManifestSha256: sha256(treePath),
  });
  writeFileSync(outputPath, `${JSON.stringify(mapping, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ output: outputPath, summary: mapping.summary, source: mapping.source })}\n`,
  );
}

function main(): void {
  const args = process.argv.slice(2);
  if (!args[1]) usage();
  if (args[0] === "queue-plan") {
    importQueuePlan(args);
    return;
  }
  if (args[0] === "davincioo-catalog") {
    importDavinciCatalog(args);
    return;
  }
  usage();
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
