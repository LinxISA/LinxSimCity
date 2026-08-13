import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const EXPECTED_ASSET_BASE = "/LinxSimCity/assets/";
const EXPECTED_MANIFEST_SHA256 =
  "428e03ac8d8a6f5ad88e1f003c26ea16deca3dd069b1b220b43110ddab135bd1";
const EXPECTED_TOPOLOGY_SHA256 =
  "18b15289f730edb56f56a20633668f3b9048e40470b26a14adae6182cc08d32c";
const TRACE_DIRECTORY = "supernpubench-fa-250-blocks";

/** @param {Uint8Array} bytes */
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyPagesBuild(
  repositoryRoot = fileURLToPath(new URL("..", import.meta.url)),
) {
  const dist = join(repositoryRoot, "apps/viewer/dist");
  const indexHtml = readFileSync(join(dist, "index.html"), "utf8");
  if (!indexHtml.includes(EXPECTED_ASSET_BASE)) {
    throw new Error(
      `Pages index must reference assets below ${EXPECTED_ASSET_BASE}`,
    );
  }

  const traceRoot = join(dist, "traces", TRACE_DIRECTORY);
  const manifestBytes = readFileSync(join(traceRoot, "manifest.json"));
  const topologyBytes = readFileSync(join(traceRoot, "topology.json"));
  const manifestSha256 = sha256(manifestBytes);
  const topologySha256 = sha256(topologyBytes);
  if (manifestSha256 !== EXPECTED_MANIFEST_SHA256) {
    throw new Error(
      `Pages FA manifest hash ${manifestSha256} does not match ${EXPECTED_MANIFEST_SHA256}`,
    );
  }
  if (topologySha256 !== EXPECTED_TOPOLOGY_SHA256) {
    throw new Error(
      `Pages FA topology hash ${topologySha256} does not match ${EXPECTED_TOPOLOGY_SHA256}`,
    );
  }

  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const index = JSON.parse(readFileSync(join(traceRoot, "index.json"), "utf8"));
  /** @type {{path: string, checkpointPath: string, eventCount: number}[]} */
  const chunks = index.chunks;
  const indexedEvents = chunks.reduce(
    (/** @type {number} */ sum, chunk) => sum + chunk.eventCount,
    0,
  );
  if (
    manifest.eventCount !== 199_585 ||
    manifest.chunkCount !== 3 ||
    indexedEvents !== manifest.eventCount
  ) {
    throw new Error("Pages FA logical bundle has inconsistent event metadata");
  }
  for (const chunk of chunks) {
    for (const path of [chunk.path, chunk.checkpointPath]) {
      if (!existsSync(join(traceRoot, path))) {
        throw new Error(`Pages FA logical bundle is missing ${path}`);
      }
    }
  }

  return {
    assetBase: EXPECTED_ASSET_BASE,
    eventCount: manifest.eventCount,
    traceDirectory: `/LinxSimCity/traces/${TRACE_DIRECTORY}/`,
    manifestSha256,
    topologySha256,
  };
}

const entryPoint = process.argv[1];
if (entryPoint && pathToFileURL(entryPoint).href === import.meta.url) {
  try {
    process.stdout.write(`${JSON.stringify(verifyPagesBuild())}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
