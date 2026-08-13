import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const EXPECTED_ASSET_BASE = "/LinxSimCity/assets/";
const EXPECTED_TRACE_SHA256 =
  "2d2001de4b1b00e3dade9a8d4e77f5f9915f235798fbbd8b5db1074e65572fa0";

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

  const trace = readFileSync(
    join(dist, "traces/supernpubench-fa-250-blocks.linxtrace"),
  );
  const traceSha256 = createHash("sha256").update(trace).digest("hex");
  if (traceSha256 !== EXPECTED_TRACE_SHA256) {
    throw new Error(
      `Pages FA trace hash ${traceSha256} does not match ${EXPECTED_TRACE_SHA256}`,
    );
  }

  return { assetBase: EXPECTED_ASSET_BASE, traceSha256 };
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
