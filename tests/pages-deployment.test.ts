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
        "428e03ac8d8a6f5ad88e1f003c26ea16deca3dd069b1b220b43110ddab135bd1",
      topologySha256:
        "18b15289f730edb56f56a20633668f3b9048e40470b26a14adae6182cc08d32c",
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
