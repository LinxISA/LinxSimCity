import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  BACKENDS,
  SCENARIOS,
  WORKLOADS,
  createRunConfiguration,
  exportRunConfiguration,
} from "@linxsimcity/scenarios";

import type { LocalSimulationRunner } from "./runner.js";
import type { StartSimulationRequest } from "./types.js";

const MAX_BODY_BYTES = 64 * 1024;

function send(response: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("request body is too large");
    chunks.push(buffer);
  }
  if (bytes === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function strictObject(
  value: unknown,
  allowedKeys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  const source = value as Record<string, unknown>;
  const unknown = Object.keys(source).find((key) => !allowedKeys.includes(key));
  if (unknown) throw new Error(`${path}.${unknown} is not supported`);
  return source;
}

export function createRunnerServer(runner: LocalSimulationRunner) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://runner.local");
      if (request.method === "GET" && url.pathname === "/catalog") {
        send(response, 200, {
          backends: Object.values(BACKENDS),
          workloads: Object.values(WORKLOADS),
          scenarios: Object.values(SCENARIOS),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/configurations") {
        const source = strictObject(
          await body(request),
          ["backendId", "workloadId", "scenarioId", "parameters"],
          "request",
        );
        const configuration = createRunConfiguration({
          backendId: source.backendId as never,
          workloadId: source.workloadId as never,
          scenarioId: source.scenarioId as never,
          parameters: strictObject(
            source.parameters ?? {},
            Object.keys(SCENARIOS.normal.parameters),
            "request.parameters",
          ),
        });
        send(response, 200, exportRunConfiguration(configuration));
        return;
      }
      if (request.method === "POST" && url.pathname === "/jobs") {
        const source = strictObject(
          await body(request),
          ["configuration", "configSha256", "simulatorOverrides"],
          "request",
        );
        if (typeof source.configSha256 !== "string") {
          throw new Error("request.configSha256 must be a string");
        }
        if (
          !Array.isArray(source.simulatorOverrides) ||
          source.simulatorOverrides.some((value) => typeof value !== "string")
        ) {
          throw new Error("request.simulatorOverrides must be a string array");
        }
        const job = runner.start(source as unknown as StartSimulationRequest);
        send(response, 202, job);
        return;
      }
      if (request.method === "GET" && url.pathname === "/jobs") {
        send(response, 200, { jobs: runner.listJobs() });
        return;
      }
      const match = /^\/jobs\/([0-9a-f-]+)(\/cancel)?$/.exec(url.pathname);
      if (match && request.method === "GET" && !match[2]) {
        const job = runner.getJob(match[1]!);
        send(response, job ? 200 : 404, job ?? { error: "job not found" });
        return;
      }
      if (match && request.method === "POST" && match[2] === "/cancel") {
        const job = runner.cancel(match[1]!);
        send(response, job ? 202 : 404, job ?? { error: "job not found" });
        return;
      }
      send(response, 404, { error: "route not found" });
    } catch (error) {
      send(response, 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
