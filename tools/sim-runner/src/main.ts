#!/usr/bin/env node

import { parseRunnerServerOptions } from "./config.js";
import { LocalSimulationRunner } from "./runner.js";
import { createRunnerServer } from "./server.js";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "serve") {
    throw new Error(
      "usage: linxsimcity-runner serve [--host HOST] [--port PORT] [--gfsim PATH] [--model-dir PATH] [--matmul-elf PATH] [--matmul-sha256 SHA256] [--runs-dir PATH] [--revision REV] [--allow-origin ORIGIN]...",
    );
  }
  const options = parseRunnerServerOptions(args);
  const runner = await LocalSimulationRunner.create(options);
  const server = createRunnerServer(runner, {
    allowedOrigins: options.allowedOrigins,
  });
  server.listen(options.port, options.host, () => {
    const address = server.address();
    const port =
      typeof address === "object" && address ? address.port : options.port;
    process.stdout.write(
      `LinxSimCity runner listening at http://${options.host}:${port}\n`,
    );
  });
  const shutdown = (): void => {
    server.close(() => {
      void runner.close().finally(() => process.exit(0));
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
