const TITLES: Readonly<Record<string, string>> = {
  checksum_mismatch: "Trace integrity check failed",
  invalid_bundle: "Trace bundle is malformed",
  invalid_entry_path: "Unsafe archive entry",
  missing_entry: "Required trace data is missing",
  resource_limit: "Trace exceeds the safe browser limit",
  unsupported_schema: "Trace schema is not supported",
};

export function diagnosticTitle(code: string): string {
  return TITLES[code] ?? "Trace could not be opened";
}
