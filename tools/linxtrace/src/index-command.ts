import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  parseEvent,
  parseManifest,
  type ChunkIndexEntry,
  type EventEnvelope,
} from "@linxsimcity/trace-schema";
import { Gunzip } from "fflate";

import { listDirectoryFiles, ResourceLimitError } from "./io.js";

const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const MAX_COMPRESSED_CHUNK_BYTES = 256 * 1024 * 1024;
const MAX_UNCOMPRESSED_CHUNK_BYTES = 1024 * 1024 * 1024;
const MAX_EVENTS = 100_000_000;

async function readJsonMetadata(path: string): Promise<unknown> {
  if ((await stat(path)).size > MAX_METADATA_BYTES) {
    throw new ResourceLimitError(
      `${path} exceeds the ${MAX_METADATA_BYTES}-byte metadata limit`,
    );
  }
  return JSON.parse(await readFile(path, "utf8"));
}

async function inspectChunk(path: string): Promise<{
  first: EventEnvelope;
  last: EventEnvelope;
  eventCount: number;
  compressedBytes: number;
  sha256: string;
}> {
  const hash = createHash("sha256");
  const decoder = new TextDecoder();
  let buffer = "";
  let compressedBytes = 0;
  let uncompressedBytes = 0;
  let eventCount = 0;
  let first: EventEnvelope | undefined;
  let last: EventEnvelope | undefined;

  const parseLine = (line: string): void => {
    if (!line) return;
    const event = parseEvent(JSON.parse(line));
    first ??= event;
    last = event;
    eventCount++;
    if (eventCount > MAX_EVENTS) {
      throw new ResourceLimitError(`event count exceeds ${MAX_EVENTS}`);
    }
  };
  const gunzip = new Gunzip((data, final) => {
    uncompressedBytes += data.byteLength;
    if (uncompressedBytes > MAX_UNCOMPRESSED_CHUNK_BYTES) {
      throw new ResourceLimitError(
        `${path} exceeds the ${MAX_UNCOMPRESSED_CHUNK_BYTES}-byte uncompressed limit`,
      );
    }
    buffer += decoder.decode(data, { stream: !final });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) parseLine(line);
    if (final) parseLine(buffer);
  });

  for await (const chunk of createReadStream(path)) {
    compressedBytes += chunk.byteLength;
    if (compressedBytes > MAX_COMPRESSED_CHUNK_BYTES) {
      throw new ResourceLimitError(
        `${path} exceeds the ${MAX_COMPRESSED_CHUNK_BYTES}-byte compressed limit`,
      );
    }
    hash.update(chunk);
    gunzip.push(chunk, false);
  }
  gunzip.push(new Uint8Array(), true);
  if (!first || !last) throw new Error(`cannot index empty chunk: ${path}`);
  return {
    first,
    last,
    eventCount,
    compressedBytes,
    sha256: hash.digest("hex"),
  };
}

export async function rebuildIndex(directory: string): Promise<void> {
  const manifest = parseManifest(
    await readJsonMetadata(join(directory, "manifest.json")),
  );
  const files = await listDirectoryFiles(directory);
  const chunks: ChunkIndexEntry[] = [];

  for (const path of files.filter((file) =>
    /^chunks\/.*\.jsonl\.gz$/.test(file),
  )) {
    const chunk = await inspectChunk(join(directory, path));
    const checkpointNumber = Math.floor(
      chunk.first.cycle / manifest.checkpointCycleSpan,
    );
    chunks.push({
      path,
      firstCycle: chunk.first.cycle,
      lastCycle: chunk.last.cycle,
      eventCount: chunk.eventCount,
      compressedBytes: chunk.compressedBytes,
      sha256: chunk.sha256,
      checkpointPath: `checkpoints/${checkpointNumber.toString().padStart(6, "0")}.json.gz`,
    });
  }

  await writeFile(
    join(directory, "index.json"),
    `${JSON.stringify({ schemaVersion: manifest.schemaVersion, chunks }, null, 2)}\n`,
  );
}
