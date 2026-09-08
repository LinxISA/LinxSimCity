import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const EXPECTED_ASSET_BASE = "/LinxSimCity/assets/";
const EXPECTED_TITLE = "LinxSimCity · 芯片城市实验台";

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
  return {
    assetBase: EXPECTED_ASSET_BASE,
    app: "game",
    assets: assets.length,
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
