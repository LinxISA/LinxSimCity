import {
  assertSafeEntryPath,
  MAX_COMPRESSED_ENTRY_BYTES,
  type EntryStore,
} from "./entry-store.js";
import { TraceBundleError, type HttpDirectorySource } from "./types.js";

function normalizeBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TraceBundleError(
      "invalid_bundle",
      `HTTP trace base URL is invalid: ${JSON.stringify(value)}`,
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TraceBundleError(
      "invalid_bundle",
      `HTTP trace base URL must use http or https: ${url.href}`,
    );
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw new TraceBundleError(
      "invalid_bundle",
      "HTTP trace base URL must not contain a query or fragment",
    );
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function declaredLength(response: Response, path: string): number | undefined {
  const header = response.headers.get("content-length");
  if (header === null) return undefined;
  const length = Number(header);
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new TraceBundleError(
      "invalid_bundle",
      `${path} has an invalid Content-Length header`,
    );
  }
  return length;
}

export class HttpEntryStore implements EntryStore {
  private readonly baseUrl: URL;
  private readonly fetchEntry: typeof fetch;
  private readonly activeRequests = new Set<AbortController>();
  private closed = false;

  private constructor(source: HttpDirectorySource) {
    this.baseUrl = normalizeBaseUrl(source.baseUrl);
    this.fetchEntry = source.fetch ?? globalThis.fetch.bind(globalThis);
  }

  static open(source: HttpDirectorySource): HttpEntryStore {
    return new HttpEntryStore(source);
  }

  async read(path: string): Promise<Uint8Array> {
    if (this.closed) {
      throw new TraceBundleError(
        "invalid_bundle",
        "HTTP trace store is closed",
      );
    }
    assertSafeEntryPath(path);
    const url = new URL(path, this.baseUrl);
    if (
      url.origin !== this.baseUrl.origin ||
      !url.pathname.startsWith(this.baseUrl.pathname)
    ) {
      throw new TraceBundleError(
        "invalid_entry_path",
        `trace entry escapes HTTP base URL: ${path}`,
      );
    }

    const controller = new AbortController();
    this.activeRequests.add(controller);
    try {
      const response = await this.fetchEntry(url.href, {
        cache: "no-cache",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new TraceBundleError(
          "missing_entry",
          `trace bundle entry is missing: ${path} (HTTP ${response.status})`,
        );
      }
      const length = declaredLength(response, path);
      if (length !== undefined && length > MAX_COMPRESSED_ENTRY_BYTES) {
        controller.abort();
        throw new TraceBundleError(
          "resource_limit",
          `${path} exceeds the ${MAX_COMPRESSED_ENTRY_BYTES}-byte entry limit`,
        );
      }

      if (response.body === null) return new Uint8Array();
      const reader = response.body.getReader();
      let result = new Uint8Array(length ?? 64 * 1024);
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const required = total + value.byteLength;
        if (required > MAX_COMPRESSED_ENTRY_BYTES) {
          controller.abort();
          throw new TraceBundleError(
            "resource_limit",
            `${path} exceeds the ${MAX_COMPRESSED_ENTRY_BYTES}-byte entry limit`,
          );
        }
        if (required > result.byteLength) {
          const capacity = Math.min(
            MAX_COMPRESSED_ENTRY_BYTES,
            Math.max(required, Math.max(result.byteLength * 2, 64 * 1024)),
          );
          const expanded = new Uint8Array(capacity);
          expanded.set(result.subarray(0, total));
          result = expanded;
        }
        result.set(value, total);
        total = required;
      }
      return total === result.byteLength ? result : result.subarray(0, total);
    } catch (error) {
      if (error instanceof TraceBundleError) throw error;
      if (this.closed || controller.signal.aborted) {
        throw new TraceBundleError(
          "invalid_bundle",
          "HTTP trace store is closed",
        );
      }
      throw new TraceBundleError(
        "missing_entry",
        `failed to fetch trace bundle entry ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.activeRequests.delete(controller);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const request of this.activeRequests) request.abort();
    this.activeRequests.clear();
  }
}
