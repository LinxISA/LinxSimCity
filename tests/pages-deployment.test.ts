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
const sourceTraceDirectory = join(
  repositoryRoot,
  "apps/viewer/public/traces/supernpubench-fa-250-blocks",
);

function createPagesFixture(indexHtml: string): string {
  const root = mkdtempSync(join(tmpdir(), "linxsimcity-pages-"));
  const dist = join(root, "apps/viewer/dist");
  mkdirSync(join(dist, "traces"), { recursive: true });
  writeFileSync(join(dist, "index.html"), indexHtml);
  cpSync(
    sourceTraceDirectory,
    join(dist, "traces/supernpubench-fa-250-blocks"),
    { recursive: true },
  );
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

test("accepts the base-prefixed Viewer with the verified FA logical bundle", () => {
  const root = createPagesFixture(
    '<script type="module" src="/LinxSimCity/assets/index.js"></script>',
  );
  try {
    expect(verifyPagesBuild(root)).toEqual({
      assetBase: "/LinxSimCity/assets/",
      eventCount: 199_585,
      traceDirectory: "/LinxSimCity/traces/supernpubench-fa-250-blocks/",
      manifestSha256:
        "f84ae484d8004a86156da6ee8f7697a917f1a15fc7876ac15eb4435f78ab3dbe",
      topologySha256:
        "71eaab6780714ef47bee5262af493bafa7325b068545517b48cfa20b658a5636",
    });
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
