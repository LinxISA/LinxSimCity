import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const EXPECTED_ASSET_BASE = "/LinxSimCity/assets/";
const EXPECTED_TITLE = "LinxSimCity · 芯片城市实验台";
const EXPECTED_PLAN_SHA256 =
  "a988cf3e5a423811424c41dcd1fcd900c9fe2de98f178fd71556c64947c580d9";
const EXPECTED_MODEL_SHA256 =
  "10845ecf3b737c28117af3c27c80eef361aa6a7ca73d9ca28ca7a53257366bb0";
const EXPECTED_CATALOG_SHA256 =
  "c12dd85baccdee37b6dc446906e0bff1ac74931f8c660d854f6b6a6c4bdffbb6";

export function verifyPagesBuild(
  repositoryRoot = fileURLToPath(new URL("..", import.meta.url)),
) {
  const dist = join(repositoryRoot, "apps/game/dist");
  const indexHtml = readFileSync(join(dist, "index.html"), "utf8");
  if (!indexHtml.includes(EXPECTED_ASSET_BASE)) {
    throw new Error(
      `Pages index must reference assets below ${EXPECTED_ASSET_BASE}`,
    );
  }
  if (!indexHtml.includes(EXPECTED_TITLE)) {
    throw new Error("Pages index must identify the chip city game");
  }
  const assets = readdirSync(join(dist, "assets"));
  if (!assets.some((name) => name.endsWith(".js"))) {
    throw new Error("Pages game build has no JavaScript entry asset");
  }
  if (existsSync(join(dist, "traces", "supernpubench-fa-250-blocks"))) {
    throw new Error(
      "Pages game must not ship the retired viewer default trace",
    );
  }
  const runRoot = join(dist, "runs", "superscalar-matmul.bundle");
  const runManifest = JSON.parse(
    readFileSync(join(runRoot, "manifest.json"), "utf8"),
  );
  const runIndex = JSON.parse(
    readFileSync(join(runRoot, "index.json"), "utf8"),
  );
  if (
    runManifest.schema !== "linxsimcity.trace" ||
    runManifest.schemaVersion !== "1" ||
    runManifest.runId !== "superscalar-matmul-m5" ||
    runManifest.topologyFingerprint !== "fnv1a64:ea6a74eb2b796df5" ||
    runManifest.simulator?.name !== "SuperScalarModel" ||
    runManifest.simulator?.revision !==
      "2406db2944317b8d64dc05b621f37fc9a13f8c81" ||
    runManifest.eventCount !== "320486" ||
    runManifest.window?.lastCycle !== "49822" ||
    runManifest.loss?.droppedEvents !== "0" ||
    runManifest.loss?.truncated !== false ||
    runIndex.schema !== "linxsimcity.trace-index" ||
    runIndex.chunks?.length !== 13 ||
    runIndex.checkpoints?.length !== 1 ||
    !existsSync(join(runRoot, runIndex.chunks[0].path)) ||
    !existsSync(join(runRoot, runIndex.checkpoints[0].path))
  ) {
    throw new Error(
      "Pages game has an invalid pinned SuperScalarModel trace bundle",
    );
  }
  const conflictRoot = join(dist, "runs", "superscalar-matmul-conflict.bundle");
  const conflictManifest = JSON.parse(
    readFileSync(join(conflictRoot, "manifest.json"), "utf8"),
  );
  const conflictIndex = JSON.parse(
    readFileSync(join(conflictRoot, "index.json"), "utf8"),
  );
  if (
    conflictManifest.runId !== "superscalar-matmul-bank-conflict-m5" ||
    conflictManifest.simulator?.revision !==
      "2406db2944317b8d64dc05b621f37fc9a13f8c81" ||
    conflictManifest.simulator?.configSha256 !==
      "9943e6351b7894662ab34468412fb64cd459da32ba25be1e6dd44f22f6b9a68f" ||
    conflictManifest.eventCount !== "303275" ||
    conflictManifest.window?.lastCycle !== "68785" ||
    conflictIndex.chunks?.length !== 17 ||
    conflictIndex.checkpoints?.length !== 1 ||
    !existsSync(join(conflictRoot, conflictIndex.chunks[0].path)) ||
    !existsSync(join(conflictRoot, conflictIndex.checkpoints[0].path))
  ) {
    throw new Error(
      "Pages game has an invalid pinned bank-conflict trace bundle",
    );
  }
  const topology = JSON.parse(
    readFileSync(
      join(dist, "topologies", "davincioo-queue-model.json"),
      "utf8",
    ),
  );
  const everyNodeHasArea = topology.nodes?.every(
    /** @param {{area?: {unit?: unknown, source?: unknown, status?: unknown}}} node */
    (node) =>
      node.area?.unit === "um2" &&
      typeof node.area.source === "string" &&
      node.area.source.length > 0 &&
      typeof node.area.status === "string" &&
      ["measured", "estimated", "aggregate", "unknown"].includes(
        node.area.status,
      ),
  );
  if (
    topology.nodes?.length !== 39 ||
    topology.edges?.length !== 32 ||
    topology.source?.planSha256 !== EXPECTED_PLAN_SHA256 ||
    topology.source?.modelSha256 !== EXPECTED_MODEL_SHA256 ||
    topology.source?.relevantInputsDirty !== false ||
    !everyNodeHasArea
  ) {
    throw new Error("Pages game has an invalid generated pyCircuit topology");
  }
  const catalog = JSON.parse(
    readFileSync(join(dist, "catalogs", "davincioo-h3.json"), "utf8"),
  );
  if (
    catalog.authority !== "catalog-mapping-not-execution-topology" ||
    catalog.source?.catalogSha256 !== EXPECTED_CATALOG_SHA256 ||
    catalog.summary?.h1 !== 7 ||
    catalog.summary?.h2 !== 31 ||
    catalog.summary?.h3Candidates !== 240 ||
    catalog.summary?.sourcePresent !== 6 ||
    catalog.candidates?.length !== 240 ||
    !catalog.candidates.every(
      /** @param {{area?: {unit?: unknown, value?: unknown, status?: unknown}}} candidate */
      (candidate) =>
        candidate.area?.unit === "um2" &&
        candidate.area.value === null &&
        candidate.area.status === "unknown",
    )
  ) {
    throw new Error("Pages game has an invalid DavinciOO H3 catalog mapping");
  }
  return {
    assetBase: EXPECTED_ASSET_BASE,
    app: "game",
    assets: assets.length,
    topologyNodes: topology.nodes.length,
    topologyEdges: topology.edges.length,
    catalogCandidates: catalog.candidates.length,
    traceEvents: Number(runManifest.eventCount),
    conflictTraceEvents: Number(conflictManifest.eventCount),
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
