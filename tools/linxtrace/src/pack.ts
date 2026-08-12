import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";

import { listDirectoryFiles } from "./io.js";

export async function packBundle(
  directory: string,
  outputPath: string,
): Promise<void> {
  const files = await listDirectoryFiles(directory);
  const output = new Uint8ArrayWriter();
  const writer = new ZipWriter(output, { keepOrder: true });

  try {
    for (const path of files) {
      const bytes = await readFile(join(directory, path));
      await writer.add(path, new Uint8ArrayReader(bytes), {
        compressionMethod: path.endsWith(".gz") ? 0 : 8,
        lastModDate: new Date(0),
      });
    }
    await writeFile(outputPath, await writer.close());
  } catch (error) {
    await writer.close().catch(() => undefined);
    throw error;
  }
}
