import {
  BlobReader,
  Uint8ArrayWriter,
  ZipReader,
  type Entry,
  type FileEntry,
} from "@zip.js/zip.js";

import {
  TraceBundleError,
  type HttpDirectorySource,
  type NodeDirectorySource,
  type NodeFileSource,
  type TraceBundleSource,
} from "./types.js";

const MAX_ENTRY_COUNT = 200_000;
export const MAX_COMPRESSED_ENTRY_BYTES = 256 * 1024 * 1024;

export interface EntryStore {
  read(path: string): Promise<Uint8Array>;
  close(): Promise<void>;
}

export function assertSafeEntryPath(path: string): string {
  const segments = path.split("/");
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new TraceBundleError(
      "invalid_entry_path",
      `unsafe trace bundle entry path: ${JSON.stringify(path)}`,
    );
  }
  return path;
}

function isNodeDirectorySource(
  source: TraceBundleSource,
): source is NodeDirectorySource {
  return (
    typeof source === "object" &&
    source !== null &&
    "kind" in source &&
    source.kind === "node-directory"
  );
}

function isNodeFileSource(source: TraceBundleSource): source is NodeFileSource {
  return (
    typeof source === "object" &&
    source !== null &&
    "kind" in source &&
    source.kind === "node-file"
  );
}

function isHttpDirectorySource(
  source: TraceBundleSource,
): source is HttpDirectorySource {
  return (
    typeof source === "object" &&
    source !== null &&
    "kind" in source &&
    source.kind === "http-directory"
  );
}

function isDirectoryHandle(
  source: TraceBundleSource,
): source is FileSystemDirectoryHandle {
  return (
    typeof source === "object" &&
    source !== null &&
    "kind" in source &&
    source.kind === "directory" &&
    "getFileHandle" in source
  );
}

class BrowserDirectoryStore implements EntryStore {
  constructor(private readonly root: FileSystemDirectoryHandle) {}

  async read(path: string): Promise<Uint8Array> {
    assertSafeEntryPath(path);
    const segments = path.split("/");
    const filename = segments.pop();
    if (!filename) {
      throw new TraceBundleError(
        "invalid_entry_path",
        `invalid entry path: ${path}`,
      );
    }
    try {
      let directory = this.root;
      for (const segment of segments) {
        directory = await directory.getDirectoryHandle(segment);
      }
      const file = await (await directory.getFileHandle(filename)).getFile();
      if (file.size > MAX_COMPRESSED_ENTRY_BYTES) {
        throw new TraceBundleError(
          "resource_limit",
          `${path} exceeds the ${MAX_COMPRESSED_ENTRY_BYTES}-byte entry limit`,
        );
      }
      return new Uint8Array(await file.arrayBuffer());
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

export class ZipEntryStore implements EntryStore {
  private readonly files = new Map<string, FileEntry>();

  private constructor(
    private readonly reader: ZipReader<unknown>,
    private readonly sourceClose: () => Promise<void>,
    entries: readonly Entry[],
  ) {
    for (const entry of entries) {
      if (entry.directory) continue;
      const path = assertSafeEntryPath(entry.filename);
      if (this.files.has(path)) {
        throw new TraceBundleError(
          "invalid_bundle",
          `duplicate ZIP entry: ${path}`,
        );
      }
      if (entry.compressedSize > MAX_COMPRESSED_ENTRY_BYTES) {
        throw new TraceBundleError(
          "resource_limit",
          `${path} exceeds the ${MAX_COMPRESSED_ENTRY_BYTES}-byte entry limit`,
        );
      }
      this.files.set(path, entry);
    }
  }

  static async fromFile(file: File): Promise<ZipEntryStore> {
    const reader = new ZipReader(new BlobReader(file));
    return ZipEntryStore.create(reader, async () => {});
  }

  static async create(
    reader: ZipReader<unknown>,
    sourceClose: () => Promise<void>,
  ): Promise<ZipEntryStore> {
    try {
      const entries: Entry[] = [];
      for await (const entry of reader.getEntriesGenerator()) {
        entries.push(entry);
        if (entries.length > MAX_ENTRY_COUNT) {
          throw new TraceBundleError(
            "resource_limit",
            `bundle exceeds the ${MAX_ENTRY_COUNT}-entry limit`,
          );
        }
      }
      return new ZipEntryStore(reader, sourceClose, entries);
    } catch (error) {
      await reader.close();
      await sourceClose();
      throw error;
    }
  }

  async read(path: string): Promise<Uint8Array> {
    assertSafeEntryPath(path);
    const entry = this.files.get(path);
    if (!entry) {
      throw new TraceBundleError(
        "missing_entry",
        `trace bundle entry is missing: ${path}`,
      );
    }
    if (entry.uncompressedSize > MAX_COMPRESSED_ENTRY_BYTES) {
      throw new TraceBundleError(
        "resource_limit",
        `${path} exceeds the ${MAX_COMPRESSED_ENTRY_BYTES}-byte entry limit`,
      );
    }
    return entry.getData(new Uint8ArrayWriter());
  }

  async close(): Promise<void> {
    await this.reader.close();
    await this.sourceClose();
  }
}

export async function openEntryStore(
  source: TraceBundleSource,
): Promise<EntryStore> {
  if (isHttpDirectorySource(source)) {
    const { HttpEntryStore } = await import("./http-entry-store.js");
    return HttpEntryStore.open(source);
  }
  if (isNodeDirectorySource(source) || isNodeFileSource(source)) {
    const modulePath = "./node-entry-store.js";
    const nodeStore = (await import(
      /* @vite-ignore */ modulePath
    )) as typeof import("./node-entry-store.js");
    return nodeStore.openNodeEntryStore(source);
  }
  if (isDirectoryHandle(source)) return new BrowserDirectoryStore(source);
  return ZipEntryStore.fromFile(source);
}
