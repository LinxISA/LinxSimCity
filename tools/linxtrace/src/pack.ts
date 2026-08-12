import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { finished } from "node:stream/promises";

import { ZipWriter } from "@zip.js/zip.js";

import { listDirectoryFiles } from "./io.js";

function assertOutputOutsideSource(
  directory: string,
  outputPath: string,
): void {
  const source = resolve(directory);
  const output = resolve(outputPath);
  const fromSource = relative(source, output);
  if (
    fromSource === "" ||
    (!fromSource.startsWith("..") && !isAbsolute(fromSource))
  ) {
    throw new Error("pack output must be outside the source directory");
  }
}

export async function packBundle(
  directory: string,
  outputPath: string,
): Promise<void> {
  assertOutputOutsideSource(directory, outputPath);
  const files = await listDirectoryFiles(directory);
  await mkdir(dirname(resolve(outputPath)), { recursive: true });

  const output = createWriteStream(outputPath, { flags: "w" });
  const writable = Writable.toWeb(output) as WritableStream<Uint8Array>;
  const writer = new ZipWriter(writable, { keepOrder: true });

  try {
    for (const path of files) {
      const readable = Readable.toWeb(
        createReadStream(join(directory, path)),
      ) as ReadableStream<Uint8Array>;
      await writer.add(path, readable, {
        compressionMethod: path.endsWith(".gz") ? 0 : 8,
        lastModDate: new Date(0),
      });
    }
    await writer.close();
    await finished(output);
  } catch (error) {
    output.destroy();
    throw error;
  }
}
