import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  parseEvent,
  parseManifest,
  type ChunkIndexEntry,
} from "@linxsimcity/trace-schema";
import { gunzipSync } from "fflate";

import { listDirectoryFiles } from "./io.js";

export async function rebuildIndex(directory: string): Promise<void> {
  const manifest = parseManifest(
    JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")),
  );
  const files = await listDirectoryFiles(directory);
  const chunks: ChunkIndexEntry[] = [];

  for (const path of files.filter((file) =>
    /^chunks\/.*\.jsonl\.gz$/.test(file),
  )) {
    const compressed = await readFile(join(directory, path));
    const events = new TextDecoder()
      .decode(gunzipSync(compressed))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => parseEvent(JSON.parse(line)));
    if (events.length === 0) {
      throw new Error(`cannot index empty chunk: ${path}`);
    }
    const firstCycle = events[0]!.cycle;
    const checkpointNumber = Math.floor(
      firstCycle / manifest.checkpointCycleSpan,
    );
    chunks.push({
      path,
      firstCycle,
      lastCycle: events.at(-1)!.cycle,
      eventCount: events.length,
      compressedBytes: compressed.byteLength,
      sha256: createHash("sha256").update(compressed).digest("hex"),
      checkpointPath: `checkpoints/${checkpointNumber.toString().padStart(6, "0")}.json.gz`,
    });
  }

  await writeFile(
    join(directory, "index.json"),
    `${JSON.stringify({ schemaVersion: manifest.schemaVersion, chunks }, null, 2)}\n`,
  );
}
