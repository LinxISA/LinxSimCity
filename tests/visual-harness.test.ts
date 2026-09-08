import { copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  checkEvidenceDirectory,
  REQUIRED_CAPTURES,
  readPngDimensions,
} from "../scripts/visual/harness.mjs";

const FIXTURE_DIRECTORY = new URL(
  "./fixtures/visual-harness/",
  import.meta.url,
);

async function copyFixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "linxsimcity-visual-"));
  await copyFile(
    new URL("manifest.json", FIXTURE_DIRECTORY),
    join(directory, "manifest.json"),
  );
  for (const capture of REQUIRED_CAPTURES) {
    await copyFile(
      new URL(capture.file, FIXTURE_DIRECTORY),
      join(directory, capture.file),
    );
  }
  return directory;
}

describe("visual evidence harness", () => {
  test("checks the complete 1440x900 fixture evidence set", async () => {
    const result = await checkEvidenceDirectory(FIXTURE_DIRECTORY.pathname);

    expect(result.captures).toHaveLength(4);
    expect(result.captures.map((capture) => capture.id)).toEqual([
      "overview",
      "h3-expanded",
      "selected-inspector",
      "bank-conflict-run",
    ]);
    expect(
      result.captures.every(
        (capture) => capture.width === 1440 && capture.height === 900,
      ),
    ).toBe(true);
  });

  test("reads dimensions from the PNG IHDR", async () => {
    const png = await readFile(new URL("01-overview.png", FIXTURE_DIRECTORY));

    expect(readPngDimensions(png)).toEqual({ width: 1440, height: 900 });
  });

  test("rejects evidence when an image no longer matches its recorded hash", async () => {
    const directory = await copyFixture();
    const file = join(directory, "03-selected-inspector.png");
    const bytes = await readFile(file);
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
    await writeFile(file, bytes);

    await expect(checkEvidenceDirectory(directory)).rejects.toThrow(
      "SHA-256 mismatch",
    );
  });

  test("rejects a manifest that omits a required capture", async () => {
    const directory = await copyFixture();
    const manifestPath = join(directory, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.captures.pop();
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

    await expect(checkEvidenceDirectory(directory)).rejects.toThrow(
      "must contain 4 captures",
    );
  });
});
