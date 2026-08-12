import { open, readFile, stat, type FileHandle } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { Reader, ZipReader } from "@zip.js/zip.js";

import {
  assertSafeEntryPath,
  ZipEntryStore,
  type EntryStore,
} from "./entry-store.js";
import {
  TraceBundleError,
  type NodeDirectorySource,
  type NodeFileSource,
} from "./types.js";

const MAX_COMPRESSED_ENTRY_BYTES = 256 * 1024 * 1024;

class NodeDirectoryStore implements EntryStore {
  private readonly root: string;

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

  async read(path: string): Promise<Uint8Array> {
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
      return readFile(absolute);
    } catch (error) {
      if (error instanceof TraceBundleError) throw error;
      throw new TraceBundleError(
        "missing_entry",
        `trace bundle entry is missing: ${path}`,
      );
    }
  }

  async close(): Promise<void> {}
}

class NodeRandomAccessReader extends Reader<string> {
  private handle: FileHandle | undefined;

  constructor(private readonly path: string) {
    super(path);
  }

  override async init(): Promise<void> {
    await super.init?.();
    this.handle = await open(this.path, "r");
    this.size = (await this.handle.stat()).size;
  }

  override async readUint8Array(
    offset: number,
    length: number,
  ): Promise<Uint8Array> {
    if (!this.handle) throw new Error("ZIP reader is not initialized");
    const bytes = new Uint8Array(length);
    const { bytesRead } = await this.handle.read(bytes, 0, length, offset);
    return bytes.subarray(0, bytesRead);
  }

  async close(): Promise<void> {
    await this.handle?.close();
    this.handle = undefined;
  }
}

export async function openNodeEntryStore(
  source: NodeDirectorySource | NodeFileSource,
): Promise<EntryStore> {
  if (source.kind === "node-directory")
    return new NodeDirectoryStore(source.path);
  const fileReader = new NodeRandomAccessReader(source.path);
  const reader = new ZipReader(fileReader);
  return ZipEntryStore.create(reader, () => fileReader.close());
}
