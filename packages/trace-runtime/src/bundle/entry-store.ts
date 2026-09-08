import {
  TraceBundleError,
  type HttpDirectorySource,
  type NodeDirectorySource,
  type TraceBundleSource,
} from "./types.js";

export const MAX_COMPRESSED_ENTRY_BYTES = 256 * 1024 * 1024;

export interface EntryStore {
  read(path: string, signal?: AbortSignal): Promise<Uint8Array>;
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

export async function openEntryStore(
  source: TraceBundleSource,
): Promise<EntryStore> {
  if (isHttpDirectorySource(source)) {
    const { HttpEntryStore } = await import("./http-entry-store.js");
    return HttpEntryStore.open(source);
  }
  if (isNodeDirectorySource(source)) {
    const modulePath = "./node-entry-store.js";
    const nodeStore = (await import(
      /* @vite-ignore */ modulePath
    )) as typeof import("./node-entry-store.js");
    return nodeStore.openNodeEntryStore(source);
  }
  throw new TraceBundleError(
    "unsupported_source",
    "current traces require node-directory or http-directory; ZIP, File, and node-file are not supported",
  );
}
