import { createReadStream } from "node:fs";
import { open, readdir, stat, type FileHandle } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { Reader, ZipReader, type Entry, type FileEntry } from "@zip.js/zip.js";

const MAX_BUNDLE_ENTRIES = 200_000;

export interface BundleSource {
  readonly entries: readonly string[];
  has(path: string): boolean;
  size(path: string): Promise<number>;
  readChunks(path: string, onChunk: (chunk: Uint8Array) => void): Promise<void>;
  close(): Promise<void>;
}

export class ResourceLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceLimitError";
  }
}

function normalizeEntryPath(path: string): string {
  return path.split(sep).join("/");
}

async function collectFiles(
  root: string,
  directory = root,
  files: string[] = [],
): Promise<string[]> {
  const names = await readdir(directory, { withFileTypes: true });
  for (const entry of names) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(root, absolute, files);
    } else if (entry.isFile()) {
      files.push(normalizeEntryPath(relative(root, absolute)));
      if (files.length > MAX_BUNDLE_ENTRIES) {
        throw new ResourceLimitError(
          `bundle exceeds the ${MAX_BUNDLE_ENTRIES}-entry resource limit`,
        );
      }
    }
  }
  return files.sort();
}

class NodeFileReader extends Reader<string> {
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
    if (!this.handle) throw new Error("ZIP file reader is not initialized");
    const bytes = new Uint8Array(length);
    const { bytesRead } = await this.handle.read(bytes, 0, length, offset);
    return bytes.subarray(0, bytesRead);
  }

  async close(): Promise<void> {
    await this.handle?.close();
    this.handle = undefined;
  }
}

class DirectoryBundleSource implements BundleSource {
  constructor(
    private readonly root: string,
    readonly entries: readonly string[],
  ) {}

  has(path: string): boolean {
    return this.entries.includes(path);
  }

  private resolveEntry(path: string): string {
    if (!this.has(path)) throw new Error(`bundle entry is missing: ${path}`);
    return resolve(this.root, path);
  }

  async size(path: string): Promise<number> {
    return (await stat(this.resolveEntry(path))).size;
  }

  async readChunks(
    path: string,
    onChunk: (chunk: Uint8Array) => void,
  ): Promise<void> {
    for await (const chunk of createReadStream(this.resolveEntry(path))) {
      onChunk(chunk);
    }
  }

  async close(): Promise<void> {}
}

class ZipBundleSource implements BundleSource {
  readonly entries: readonly string[];
  private readonly files: Map<string, FileEntry>;

  constructor(
    private readonly reader: ZipReader<string>,
    private readonly fileReader: NodeFileReader,
    entries: readonly Entry[],
  ) {
    this.files = new Map();
    for (const entry of entries) {
      if (entry.directory) continue;
      if (this.files.has(entry.filename)) {
        throw new Error(`duplicate ZIP entry: ${entry.filename}`);
      }
      this.files.set(entry.filename, entry);
    }
    this.entries = [...this.files.keys()].sort();
  }

  has(path: string): boolean {
    return this.files.has(path);
  }

  private entry(path: string): FileEntry {
    const entry = this.files.get(path);
    if (!entry) throw new Error(`bundle entry is missing: ${path}`);
    return entry;
  }

  async size(path: string): Promise<number> {
    return this.entry(path).uncompressedSize;
  }

  async readChunks(
    path: string,
    onChunk: (chunk: Uint8Array) => void,
  ): Promise<void> {
    await this.entry(path).getData(
      new WritableStream<Uint8Array>({ write: onChunk }),
    );
  }

  async close(): Promise<void> {
    await this.reader.close();
    await this.fileReader.close();
  }
}

export async function readEntryLimited(
  bundle: BundleSource,
  path: string,
  limit: number,
  onChunk?: (chunk: Uint8Array) => void,
): Promise<Uint8Array> {
  const declaredSize = await bundle.size(path);
  if (declaredSize > limit) {
    throw new ResourceLimitError(
      `${path} exceeds the ${limit}-byte resource limit`,
    );
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  await bundle.readChunks(path, (chunk) => {
    onChunk?.(chunk);
    total += chunk.byteLength;
    if (total > limit) {
      throw new ResourceLimitError(
        `${path} exceeds the ${limit}-byte resource limit`,
      );
    }
    chunks.push(chunk);
  });
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function openBundle(path: string): Promise<BundleSource> {
  const metadata = await stat(path);
  if (metadata.isDirectory()) {
    const root = resolve(path);
    return new DirectoryBundleSource(root, await collectFiles(root));
  }
  if (!metadata.isFile()) {
    throw new Error(`bundle path is neither a directory nor a file: ${path}`);
  }

  const fileReader = new NodeFileReader(path);
  const reader = new ZipReader(fileReader);
  try {
    const entries: Entry[] = [];
    for await (const entry of reader.getEntriesGenerator()) {
      entries.push(entry);
      if (entries.length > MAX_BUNDLE_ENTRIES) {
        throw new ResourceLimitError(
          `bundle exceeds the ${MAX_BUNDLE_ENTRIES}-entry resource limit`,
        );
      }
    }
    return new ZipBundleSource(reader, fileReader, entries);
  } catch (error) {
    await reader.close();
    await fileReader.close();
    throw error;
  }
}

export async function listDirectoryFiles(path: string): Promise<string[]> {
  const root = resolve(path);
  const metadata = await stat(root);
  if (!metadata.isDirectory()) {
    throw new Error(`expected a logical bundle directory: ${path}`);
  }
  return collectFiles(root);
}
