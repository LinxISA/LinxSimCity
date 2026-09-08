import {
  cpSync,
  readFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

import { verifyPagesBuild } from "../scripts/verify-pages-build.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceTopology = join(
  repositoryRoot,
  "apps/game/public/topologies/davincioo-queue-model.json",
);
const sourceCatalog = join(
  repositoryRoot,
  "apps/game/public/catalogs/davincioo-h3.json",
);
const sourceRun = join(
  repositoryRoot,
  "apps/game/public/runs/superscalar-matmul.bundle",
);
function createPagesFixture(indexHtml: string): string {
  const root = mkdtempSync(join(tmpdir(), "linxsimcity-pages-"));
  const dist = join(root, "apps/game/dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  mkdirSync(join(dist, "topologies"), { recursive: true });
  mkdirSync(join(dist, "catalogs"), { recursive: true });
  mkdirSync(join(dist, "runs"), { recursive: true });
  writeFileSync(join(dist, "index.html"), indexHtml);
  writeFileSync(join(dist, "assets/index.js"), "export {};\n");
  cpSync(sourceTopology, join(dist, "topologies/davincioo-queue-model.json"));
  cpSync(sourceCatalog, join(dist, "catalogs/davincioo-h3.json"));
  cpSync(sourceRun, join(dist, "runs/superscalar-matmul.bundle"), {
    recursive: true,
  });
  return root;
}

test("rejects a Pages artifact whose assets escape the repository base", () => {
  const root = createPagesFixture(
    '<script type="module" src="/assets/index.js"></script>',
  );
  try {
    expect(() => verifyPagesBuild(root)).toThrow(/LinxSimCity.*assets/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts the base-prefixed chip city game without the retired trace", () => {
  const root = createPagesFixture(
    "<title>LinxSimCity · 芯片城市实验台</title>" +
      '<script type="module" src="/LinxSimCity/assets/index.js"></script>',
  );
  try {
    expect(verifyPagesBuild(root)).toEqual({
      assetBase: "/LinxSimCity/assets/",
      app: "game",
      assets: 1,
      topologyNodes: 39,
      topologyEdges: 32,
      catalogCandidates: 240,
      traceEvents: 313318,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a game artifact that still ships the retired default trace", () => {
  const root = createPagesFixture(
    "<title>LinxSimCity · 芯片城市实验台</title>" +
      '<script type="module" src="/LinxSimCity/assets/index.js"></script>',
  );
  mkdirSync(join(root, "apps/game/dist/traces/supernpubench-fa-250-blocks"), {
    recursive: true,
  });
  try {
    expect(() => verifyPagesBuild(root)).toThrow(
      /retired viewer default trace/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the Pages workflow verifies the production artifact before upload", () => {
  const workflow = readFileSync(
    join(repositoryRoot, ".github/workflows/pages.yml"),
    "utf8",
  );
  const verify = workflow.indexOf("- run: npm run pages:verify");
  const upload = workflow.indexOf("- uses: actions/upload-pages-artifact@v4");

  expect(verify).toBeGreaterThan(-1);
  expect(upload).toBeGreaterThan(verify);
});
