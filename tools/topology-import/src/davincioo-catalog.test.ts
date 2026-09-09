import { expect, test } from "vitest";

import {
  parseDavinciSourceCatalog,
  representationForDisposition,
} from "./davincioo-catalog.js";

test("maps every source disposition without creating duplicate owners", () => {
  expect(representationForDisposition("leaf")).toBe("module");
  expect(representationForDisposition("state_schema")).toBe("contained-state");
  expect(representationForDisposition("interface")).toBe("interface");
  expect(representationForDisposition("alias")).toBe("alias");
  expect(representationForDisposition("assembly")).toBe("assembly");
  expect(representationForDisposition("review")).toBe("unresolved");
  expect(() => representationForDisposition("invented")).toThrow(
    /unsupported DavinciOO disposition/,
  );
});

test("rejects a source catalog without a module inventory", () => {
  expect(() => parseDavinciSourceCatalog({ modules: "missing" })).toThrow(
    /modules array/,
  );
});
