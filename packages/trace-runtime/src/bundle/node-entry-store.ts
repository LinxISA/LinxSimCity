import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { assertSafeEntryPath, type EntryStore } from "./entry-store.js";
import { TraceBundleError, type NodeDirectorySource } from "./types.js";

const MAX_COMPRESSED_ENTRY_BYTES = 256 * 1024 * 1024;

class NodeDirectoryStore implements EntryStore {
  private readonly root: string;
  private closed = false;

  constructor(path: string) {
    this.root = resolve(path);
  }

  private entryPath(path: string): string {
    assertSafeEntryPath(path);
    const absolute = resolve(this.root, ...path.split("/"));
    const relative = absolute.slice(this.root.length);
    if (absolute !== this.root && !relative.startsWith(sep)) {
      throw new TraceBundleError(
        "invalid_entry_path",
        `entry escapes bundle root: ${path}`,
      );
    }
    return absolute;
  }

  async read(path: string, signal?: AbortSignal): Promise<Uint8Array> {
    if (this.closed)
      throw new TraceBundleError("invalid_bundle", "trace store is closed");
    signal?.throwIfAborted();
    const absolute = this.entryPath(path);
    try {
      const metadata = await stat(absolute);
      if (!metadata.isFile()) throw new Error("not a file");
      if (metadata.size > MAX_COMPRESSED_ENTRY_BYTES) {
        throw new TraceBundleError(
          "resource_limit",
          `${path} exceeds the ${MAX_COMPRESSED_ENTRY_BYTES}-byte entry limit`,
        );
      }
      const bytes = await readFile(absolute, signal ? { signal } : undefined);
      signal?.throwIfAborted();
      return bytes;
    } catch (error) {
      if (error instanceof TraceBundleError || signal?.aborted) throw error;
      throw new TraceBundleError(
        "missing_entry",
        `trace bundle entry is missing: ${path}`,
      );
    }
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

export function openNodeEntryStore(source: NodeDirectorySource): EntryStore {
  return new NodeDirectoryStore(source.path);
}
