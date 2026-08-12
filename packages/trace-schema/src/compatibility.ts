export const SUPPORTED_SCHEMA_MAJOR = 1;

const SEMANTIC_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

export function assertCompatibleVersion(version: string): void {
  const match = SEMANTIC_VERSION.exec(version);
  if (!match) {
    throw new Error(`invalid schema version: ${version}`);
  }

  const major = Number(match[1]);
  if (major !== SUPPORTED_SCHEMA_MAJOR) {
    throw new Error(`unsupported schema major: ${major}`);
  }
}
