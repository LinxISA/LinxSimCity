#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export const declarationWorkspaces = Object.freeze([
  "@linxsimcity/trace-schema",
  "@linxsimcity/topology",
  "@linxsimcity/trace-runtime",
  "@linxsimcity/scene-core",
  "@linxsimcity/scene-modules",
]);

const allWorkspaces = Object.freeze([
  ...declarationWorkspaces,
  "@linxsimcity/viewer",
  "@linxsimcity/linxtrace",
]);

/**
 * @typedef {"build" | "typecheck"} WorkspaceMode
 * @typedef {"build" | "root-typecheck" | "typecheck"} WorkspaceStep
 * @typedef {readonly [WorkspaceStep, string]} PlanStep
 */

/**
 * Return a stable, serial plan so transitive pre-scripts cannot repeatedly build
 * the same package or overlap memory-intensive TypeScript/Vite processes.
 *
 * @param {string} mode
 * @returns {PlanStep[]}
 */
export function workspaceExecutionPlan(mode) {
  if (mode === "build") {
    return allWorkspaces.map((workspace) => ["build", workspace]);
  }
  if (mode === "typecheck") {
    return [
      ...declarationWorkspaces.map(
        (workspace) => /** @type {PlanStep} */ (["build", workspace]),
      ),
      ["root-typecheck", "linxsimcity"],
      ...allWorkspaces.map(
        (workspace) => /** @type {PlanStep} */ (["typecheck", workspace]),
      ),
    ];
  }
  throw new Error("Expected workspace command to be build or typecheck");
}

/** @param {PlanStep} step */
function runStep([command, workspace]) {
  const result =
    command === "root-typecheck"
      ? spawnSync(
          process.execPath,
          [
            join(repositoryRoot, "node_modules", "typescript", "bin", "tsc"),
            "--project",
            join(repositoryRoot, "tsconfig.json"),
            "--noEmit",
          ],
          { cwd: repositoryRoot, stdio: "inherit" },
        )
      : spawnSync(
          "npm",
          [
            "run",
            command,
            "--workspace",
            workspace,
            "--if-present",
            "--ignore-scripts",
          ],
          { cwd: repositoryRoot, stdio: "inherit" },
        );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = result.signal
      ? `terminated by ${result.signal}`
      : `exited with ${result.status ?? "unknown status"}`;
    throw new Error(`${command} for ${workspace} ${detail}`);
  }
}

function main() {
  const mode = process.argv[2] ?? "";
  for (const step of workspaceExecutionPlan(mode)) {
    runStep(step);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
