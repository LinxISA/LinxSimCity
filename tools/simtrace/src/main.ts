#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { validateRunDocument } from "./validate.js";

function main(): void {
  const [command, runArgument, topologyArgument] = process.argv.slice(2);
  if (command !== "validate" || !runArgument || !topologyArgument) {
    throw new Error("usage: simtrace validate <run.json> <topology.json>");
  }
  const runPath = resolve(runArgument);
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
