import { open, readFile, realpath, stat } from "node:fs/promises";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from "node:http";
import { isAbsolute, relative, resolve, sep } from "node:path";

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
const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const ROOT_BUNDLE_FILES = Object.freeze([
  "manifest.json",
  "topology.json",
  "index.json",
]);

export interface RunnerHttpOptions {
  readonly allowedOrigins?: readonly string[] | undefined;
}

interface BundleIndex {
  readonly chunks?: readonly { readonly path?: unknown }[];
  readonly checkpoints?: readonly { readonly path?: unknown }[];
}

interface BundleResource {
  readonly path: string;
  readonly contentType: string;
  readonly contentEncoding?: "gzip";
}

function send(
  response: ServerResponse,
  status: number,
  value: unknown,
  headers: OutgoingHttpHeaders = {},
): void {
  const responseBody = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(responseBody),
    "cache-control": "no-store",
    ...headers,
  });
  response.end(responseBody);
}

function sendEmpty(
  response: ServerResponse,
  status: number,
  headers: OutgoingHttpHeaders,
): void {
  response.writeHead(status, {
    "content-length": 0,
    "cache-control": "no-store",
    ...headers,
  });
  response.end();
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

function routeMethods(pathname: string): readonly string[] | undefined {
  if (pathname === "/catalog") return ["GET"];
  if (pathname === "/configurations") return ["POST"];
  if (pathname === "/jobs") return ["GET", "POST"];
  if (/^\/jobs\/[0-9a-f-]+$/.test(pathname)) return ["GET"];
  if (/^\/jobs\/[0-9a-f-]+\/cancel$/.test(pathname)) return ["POST"];
  if (/^\/jobs\/[0-9a-f-]+\/bundle\/.+$/.test(pathname)) return ["GET"];
  return undefined;
}

function corsHeaders(
  headers: IncomingHttpHeaders,
  allowedOrigins: ReadonlySet<string>,
): OutgoingHttpHeaders | undefined {
  const origin = headers.origin;
  if (origin === undefined) return {};
  if (!allowedOrigins.has(origin)) return undefined;
  return {
    "access-control-allow-origin": origin,
    vary: "Origin",
  };
}

function preflightHeadersAllowed(headers: IncomingHttpHeaders): boolean {
  const requested = headers["access-control-request-headers"];
  if (!requested) return true;
  return requested
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .every((value) => value === "content-type");
}

function safeBundlePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.includes("\\") &&
    !path.includes("\0") &&
    !isAbsolute(path) &&
    path
      .split("/")
      .every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

function indexedBundleFiles(index: BundleIndex): ReadonlySet<string> {
  const files = new Set<string>(ROOT_BUNDLE_FILES);
  for (const entry of [...(index.chunks ?? []), ...(index.checkpoints ?? [])]) {
    if (typeof entry.path === "string" && safeBundlePath(entry.path)) {
      files.add(entry.path);
    }
  }
  return files;
}

async function resolveBundleResource(
  runner: LocalSimulationRunner,
  jobId: string,
  encodedPath: string,
): Promise<BundleResource | undefined> {
  const job = runner.getJob(jobId);
  if (job?.status !== "succeeded" || !job.result) return undefined;

  let requestedPath: string;
  try {
    requestedPath = decodeURIComponent(encodedPath);
  } catch {
    return undefined;
  }
  if (!safeBundlePath(requestedPath)) return undefined;

  let index: BundleIndex;
  try {
    index = JSON.parse(
      await readFile(resolve(job.result.bundlePath, "index.json"), "utf8"),
    ) as BundleIndex;
  } catch {
    return undefined;
  }
  if (!indexedBundleFiles(index).has(requestedPath)) return undefined;

  try {
    const bundleRoot = await realpath(job.result.bundlePath);
    const resourcePath = await realpath(resolve(bundleRoot, requestedPath));
    const withinBundle = relative(bundleRoot, resourcePath);
    if (
      withinBundle === "" ||
      withinBundle === ".." ||
      withinBundle.startsWith(`..${sep}`) ||
      isAbsolute(withinBundle)
    ) {
      return undefined;
    }
    const metadata = await stat(resourcePath);
    if (!metadata.isFile()) return undefined;
    const gzip = requestedPath.endsWith(".gz");
    return {
      path: resourcePath,
      contentType: requestedPath.includes(".jsonl")
        ? "application/x-ndjson; charset=utf-8"
        : "application/json; charset=utf-8",
      ...(gzip ? { contentEncoding: "gzip" as const } : {}),
    };
  } catch {
    return undefined;
  }
}

async function sendBundleResource(
  response: ServerResponse,
  resource: BundleResource,
  cors: OutgoingHttpHeaders,
): Promise<void> {
  const handle = await open(resource.path, "r");
  try {
    const metadata = await handle.stat();
    response.writeHead(200, {
      "content-type": resource.contentType,
      "content-length": metadata.size,
      "cache-control": "no-store",
      ...(resource.contentEncoding
        ? { "content-encoding": resource.contentEncoding }
        : {}),
      ...cors,
    });
    await new Promise<void>((resolveStream, rejectStream) => {
      const stream = handle.createReadStream({ autoClose: false });
      stream.once("error", rejectStream);
      response.once("error", rejectStream);
      response.once("finish", resolveStream);
      stream.pipe(response);
    });
  } finally {
    await handle.close();
  }
}

export function createRunnerServer(
  runner: LocalSimulationRunner,
  options: RunnerHttpOptions = {},
) {
  const allowedOrigins = new Set(
    options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS,
  );
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://runner.local");
      const methods = routeMethods(url.pathname);
      if (!methods) {
        send(response, 404, { error: "route not found" });
        return;
      }
      const cors = corsHeaders(request.headers, allowedOrigins);
      if (!cors) {
        send(response, 403, { error: "origin is not allowed" });
        return;
      }
      if (request.method === "OPTIONS") {
        const requestedMethod =
          request.headers["access-control-request-method"];
        if (
          !request.headers.origin ||
          !requestedMethod ||
          !methods.includes(requestedMethod) ||
          !preflightHeadersAllowed(request.headers)
        ) {
          send(response, 403, { error: "CORS preflight is not allowed" });
          return;
        }
        sendEmpty(response, 204, {
          ...cors,
          "access-control-allow-methods": methods.join(", "),
          ...(request.headers["access-control-request-headers"]
            ? { "access-control-allow-headers": "Content-Type" }
            : {}),
        });
        return;
      }
      if (!request.method || !methods.includes(request.method)) {
        send(response, 405, { error: "method not allowed" }, cors);
        return;
      }

      if (request.method === "GET" && url.pathname === "/catalog") {
        send(
          response,
          200,
          {
            backends: Object.values(BACKENDS),
            workloads: Object.values(WORKLOADS),
            scenarios: Object.values(SCENARIOS),
          },
          cors,
        );
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
        send(response, 200, exportRunConfiguration(configuration), cors);
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
        send(response, 202, job, cors);
        return;
      }
      if (request.method === "GET" && url.pathname === "/jobs") {
        send(response, 200, { jobs: runner.listJobs() }, cors);
        return;
      }
      const bundleMatch = /^\/jobs\/([0-9a-f-]+)\/bundle\/(.+)$/.exec(
        url.pathname,
      );
      if (bundleMatch && request.method === "GET") {
        const resource = await resolveBundleResource(
          runner,
          bundleMatch[1]!,
          bundleMatch[2]!,
        );
        if (!resource) {
          send(response, 404, { error: "bundle resource not found" }, cors);
          return;
        }
        await sendBundleResource(response, resource, cors);
        return;
      }
      const match = /^\/jobs\/([0-9a-f-]+)(\/cancel)?$/.exec(url.pathname);
      if (match && request.method === "GET" && !match[2]) {
        const job = runner.getJob(match[1]!);
        send(
          response,
          job ? 200 : 404,
          job ?? { error: "job not found" },
          cors,
        );
        return;
      }
      if (match && request.method === "POST" && match[2] === "/cancel") {
        const job = runner.cancel(match[1]!);
        send(
          response,
          job ? 202 : 404,
          job ?? { error: "job not found" },
          cors,
        );
        return;
      }
      send(response, 404, { error: "route not found" }, cors);
    } catch (error) {
      if (!response.headersSent) {
        send(response, 400, {
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    }
  });
}
