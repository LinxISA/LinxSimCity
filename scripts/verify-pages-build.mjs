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
  const topology = JSON.parse(
    readFileSync(
      join(dist, "topologies", "davincioo-queue-model.json"),
      "utf8",
    ),
  );
  if (
    topology.nodes?.length !== 39 ||
    topology.edges?.length !== 32 ||
    topology.source?.planSha256 !== EXPECTED_PLAN_SHA256 ||
    topology.source?.modelSha256 !== EXPECTED_MODEL_SHA256 ||
    topology.source?.relevantInputsDirty !== false
  ) {
    throw new Error("Pages game has an invalid generated pyCircuit topology");
  }
  return {
    assetBase: EXPECTED_ASSET_BASE,
    app: "game",
    assets: assets.length,
    topologyNodes: topology.nodes.length,
    topologyEdges: topology.edges.length,
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
