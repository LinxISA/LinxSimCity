#!/usr/bin/env node
// @ts-nocheck -- Small Node CLI; pure enrichment logic is typed by its .d.mts contract.

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { enrichPipeviewStageCity } from "./lib/pipeview-stage-city.mjs";

const CAPABILITY = "pipeview-stage-city-v1";

function writeJsonAtomic(path, value) {
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${Date.now()}.tmp`,
  );
  writeFileSync(temporary, `${JSON.stringify(value)}\n`, { flag: "wx" });
  renameSync(temporary, path);
}

export function main(argv) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      "trace-dir": { type: "string" },
      force: { type: "boolean", default: false },
    },
  });
  if (!values["trace-dir"]) {
    throw new Error("--trace-dir PATH is required");
  }
  const traceDirectory = resolve(values["trace-dir"]);
  const topologyPath = join(traceDirectory, "topology.json");
  const manifestPath = join(traceDirectory, "manifest.json");
  const topology = JSON.parse(readFileSync(topologyPath, "utf8"));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capabilities = Array.isArray(manifest.capabilities)
    ? manifest.capabilities
    : [];
  if (capabilities.includes(CAPABILITY) && !values.force) {
    throw new Error(`trace already declares ${CAPABILITY}; pass --force to rebuild`);
  }

  const enriched = enrichPipeviewStageCity(topology);
  const nextManifest = {
    ...manifest,
    capabilities: [...capabilities.filter((value) => value !== CAPABILITY), CAPABILITY],
  };
  writeJsonAtomic(topologyPath, enriched);
  writeJsonAtomic(manifestPath, nextManifest);
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
