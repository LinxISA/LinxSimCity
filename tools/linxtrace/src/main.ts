#!/usr/bin/env node

import { Command } from "commander";

import { rebuildIndex } from "./index-command.js";
import { formatInspection, inspectBundle } from "./inspect.js";
import { packBundle } from "./pack.js";
import { validateBundle } from "./validate.js";

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const program = new Command()
  .name("linxtrace")
  .description("Validate, index, pack, and inspect LinxSimCity traces")
  .version("0.1.0");

program
  .command("validate")
  .argument("<bundle>", "logical trace directory or .linxtrace ZIP")
  .option("--json", "print the validation report as JSON")
  .action(async (bundle: string, options: { json?: boolean }) => {
    const report = await validateBundle(bundle);
    if (options.json) {
      printJson(report);
    } else if (report.valid) {
      process.stdout.write(
        `Valid trace: ${report.stats.events} events in ${report.stats.chunks} chunks\n`,
      );
    } else {
      for (const error of report.errors) {
        process.stderr.write(
          `${error.code}: ${error.path}: ${error.message}\n`,
        );
      }
    }
    if (!report.valid) process.exitCode = 2;
  });

program
  .command("index")
  .argument("<directory>", "logical trace directory")
  .action(async (directory: string) => {
    await rebuildIndex(directory);
  });

program
  .command("pack")
  .argument("<directory>", "logical trace directory")
  .argument("<output>", "output .linxtrace path")
  .action(async (directory: string, output: string) => {
    await packBundle(directory, output);
  });

program
  .command("inspect")
  .argument("<bundle>", "logical trace directory or .linxtrace ZIP")
  .option("--json", "print inspection data as JSON")
  .action(async (bundle: string, options: { json?: boolean }) => {
    const inspection = await inspectBundle(bundle);
    process.stdout.write(
      options.json
        ? `${JSON.stringify(inspection, null, 2)}\n`
        : `${formatInspection(inspection)}\n`,
    );
    if (!inspection.valid) process.exitCode = 2;
  });

await program.parseAsync(process.argv).catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "linxtrace command failed"}\n`,
  );
  process.exitCode = 1;
});
