import { ResourceLimitError } from "./io.js";

export interface ResourceLimits {
  metadataEntryBytes: number;
  totalMetadataBytes: number;
  totalCompressedBytes: number;
  totalUncompressedBytes: number;
  chunks: number;
  events: number;
}

export const DEFAULT_RESOURCE_LIMITS: Readonly<ResourceLimits> = {
  metadataEntryBytes: 16 * 1024 * 1024,
  totalMetadataBytes: 64 * 1024 * 1024,
  totalCompressedBytes: 4 * 1024 * 1024 * 1024,
  totalUncompressedBytes: 16 * 1024 * 1024 * 1024,
  chunks: 100_000,
  events: 100_000_000,
};

export type ResourceLimitOverrides = Partial<ResourceLimits>;

export class ResourceBudget {
  readonly limits: Readonly<ResourceLimits>;
  private metadataBytes = 0;
  private compressedBytes = 0;
  private uncompressedBytes = 0;
  private events = 0;

  constructor(overrides: ResourceLimitOverrides = {}) {
    this.limits = { ...DEFAULT_RESOURCE_LIMITS, ...overrides };
  }

  consumeMetadata(bytes: number, path: string): void {
    this.metadataBytes += bytes;
    this.assertWithin(
      this.metadataBytes,
      this.limits.totalMetadataBytes,
      `${path}: total metadata bytes`,
    );
  }

  consumeCompressed(bytes: number, path: string): void {
    this.compressedBytes += bytes;
    this.assertWithin(
      this.compressedBytes,
      this.limits.totalCompressedBytes,
      `${path}: total compressed bytes`,
    );
  }

  consumeUncompressed(bytes: number, path: string): void {
    this.uncompressedBytes += bytes;
    this.assertWithin(
      this.uncompressedBytes,
      this.limits.totalUncompressedBytes,
      `${path}: total uncompressed bytes`,
    );
  }

  consumeEvent(path: string): void {
    this.events++;
    this.assertWithin(this.events, this.limits.events, `${path}: event count`);
  }

  assertChunks(count: number, path: string): void {
    this.assertWithin(count, this.limits.chunks, `${path}: chunk count`);
  }

  private assertWithin(actual: number, limit: number, label: string): void {
    if (actual > limit) {
      throw new ResourceLimitError(`${label} exceeds the ${limit} limit`);
    }
  }
}
