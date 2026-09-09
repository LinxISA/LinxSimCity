#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { validateRunDocument } from "./validate.js";
import { validateTraceBundle } from "./bundle.js";

function main(): void {
  const [command, runArgument, topologyArgument] = process.argv.slice(2);
  if (command !== "validate" || !runArgument) {
    throw new Error(
      "usage: simtrace validate <bundle-directory> | <run.json> <topology.json>",
    );
  }
  const runPath = resolve(runArgument);
  if (statSync(runPath).isDirectory()) {
    if (topologyArgument) {
      throw new Error("bundle validation accepts one directory argument");
    }
    const result = validateTraceBundle(runPath);
    process.stdout.write(
      `${JSON.stringify({
        valid: result.diagnostics.length === 0,
        runId: result.manifest.runId,
        events: result.events.length,
        chunks: result.index.chunks.length,
        checkpoints: result.checkpoints.length,
        topology: result.topology.id,
        diagnostics: result.diagnostics,
      })}\n`,
    );
    if (result.diagnostics.length > 0) process.exitCode = 2;
    return;
  }
  if (!topologyArgument) {
    throw new Error("standalone run validation requires a topology argument");
  }
  const topologyPath = resolve(topologyArgument);
  const result = validateRunDocument(
    JSON.parse(readFileSync(runPath, "utf8")) as unknown,
    JSON.parse(readFileSync(topologyPath, "utf8")) as unknown,
  );
  const summary = {
    valid: result.diagnostics.length === 0,
    runId: result.run.manifest.runId,
    events: result.run.events.length,
    topology: result.topology.id,
    diagnostics: result.diagnostics,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (result.diagnostics.length > 0) process.exitCode = 2;
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
