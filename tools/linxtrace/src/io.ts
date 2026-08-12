import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import {
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  type Entry,
} from "@zip.js/zip.js";

export interface BundleSource {
  readonly entries: readonly string[];
  has(path: string): boolean;
  read(path: string): Promise<Uint8Array>;
  close(): Promise<void>;
}

function normalizeEntryPath(path: string): string {
  return path.split(sep).join("/");
}

async function collectFiles(root: string, directory = root): Promise<string[]> {
  const names = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    names.map(async (entry) => {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(root, absolute);
      }
      return entry.isFile()
        ? [normalizeEntryPath(relative(root, absolute))]
        : [];
    }),
  );
  return nested.flat().sort();
}

class DirectoryBundleSource implements BundleSource {
  constructor(
    private readonly root: string,
    readonly entries: readonly string[],
  ) {}

  has(path: string): boolean {
    return this.entries.includes(path);
  }

  async read(path: string): Promise<Uint8Array> {
    if (!this.has(path)) {
      throw new Error(`bundle entry is missing: ${path}`);
    }
    return readFile(resolve(this.root, path));
  }

  async close(): Promise<void> {}
}

class ZipBundleSource implements BundleSource {
  readonly entries: readonly string[];
  private readonly files: Map<string, Entry>;

  constructor(
    private readonly reader: ZipReader<Uint8Array>,
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

  async read(path: string): Promise<Uint8Array> {
    const entry = this.files.get(path);
    if (!entry || entry.directory) {
      throw new Error(`bundle entry is missing: ${path}`);
    }
    return entry.getData(new Uint8ArrayWriter());
  }

  async close(): Promise<void> {
    await this.reader.close();
  }
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

  const bytes = await readFile(path);
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  try {
    return new ZipBundleSource(reader, await reader.getEntries());
  } catch (error) {
    await reader.close();
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
