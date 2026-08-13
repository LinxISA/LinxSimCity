import {
  copyFileSync,
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
const sourceTrace = join(
  repositoryRoot,
  "apps/viewer/public/traces/supernpubench-fa-250-blocks.linxtrace",
);

function createPagesFixture(indexHtml: string): string {
  const root = mkdtempSync(join(tmpdir(), "linxsimcity-pages-"));
  const dist = join(root, "apps/viewer/dist");
  mkdirSync(join(dist, "traces"), { recursive: true });
  writeFileSync(join(dist, "index.html"), indexHtml);
  copyFileSync(
    sourceTrace,
    join(dist, "traces/supernpubench-fa-250-blocks.linxtrace"),
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

test("accepts the base-prefixed Viewer with the verified FA archive", () => {
  const root = createPagesFixture(
    '<script type="module" src="/LinxSimCity/assets/index.js"></script>',
  );
  try {
    expect(verifyPagesBuild(root)).toEqual({
      assetBase: "/LinxSimCity/assets/",
      traceSha256:
        "2d2001de4b1b00e3dade9a8d4e77f5f9915f235798fbbd8b5db1074e65572fa0",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
