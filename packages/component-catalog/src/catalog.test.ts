import { describe, expect, test } from "vitest";

import { CORE_CATALOG, validateCatalog } from "./index.js";

describe("core component catalog", () => {
  test("contains one valid definition for every first-slice brick kind", () => {
    expect(validateCatalog(CORE_CATALOG)).toEqual([]);
    expect(
      new Set(CORE_CATALOG.definitions.map((item) => item.kind)).size,
    ).toBe(10);
  });

  test("rejects duplicate definition and port IDs", () => {
    const duplicate = {
      ...CORE_CATALOG.definitions[0]!,
      ports: [
        CORE_CATALOG.definitions[0]!.ports[0]!,
        CORE_CATALOG.definitions[0]!.ports[0]!,
      ],
    };
    const diagnostics = validateCatalog({
      ...CORE_CATALOG,
      definitions: [duplicate, duplicate],
    });
    expect(diagnostics.map((item) => item.message)).toContain(
      "duplicates another definition ID",
    );
    expect(diagnostics.map((item) => item.message)).toContain(
      "duplicates another port ID",
    );
  });
});
