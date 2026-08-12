type StructuralSegment = string | number;

export type EntityIdParts =
  | { kind: "module"; path: readonly string[] }
  | { kind: "cache-line"; pe?: number; cache: string; set: number; way: number }
  | { kind: "rob-slot"; pe?: number; rob?: string; slot: number }
  | { kind: "queue-slot"; pe?: number; queue: string; slot: number }
  | { kind: "register"; pe?: number; file: string; index: number }
  | { kind: "cell"; pe: number; bank: number; row: number }
  | { kind: "xbar-lane"; pe?: number; xbar: string; lane: number }
  | { kind: "cube-mac"; pe: number; m: number; n: number }
  | { kind: "stgbufb-subspace"; pe?: number; subspace: number }
  | { kind: "pipe"; path: readonly string[]; lane?: number };

const structuralNamePattern = /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/;

function structuralName(value: string): string {
  if (!structuralNamePattern.test(value)) {
    throw new Error(`structural name must match ${structuralNamePattern}`);
  }

  return value.toLowerCase();
}

function structuralIndex(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("structural index must be a non-negative safe integer");
  }

  return value;
}

function prefixPe(
  pe: number | undefined,
  segments: StructuralSegment[],
): string[] {
  return pe === undefined
    ? segments.map(String)
    : [`pe${structuralIndex(pe)}`, ...segments.map(String)];
}

export function formatEntityId(parts: EntityIdParts): string {
  switch (parts.kind) {
    case "module":
      if (parts.path.length === 0) {
        throw new Error("structural module path must not be empty");
      }
      return parts.path.map(structuralName).join(".");
    case "cache-line":
      return prefixPe(parts.pe, [
        structuralName(parts.cache),
        `set${structuralIndex(parts.set)}`,
        `way${structuralIndex(parts.way)}`,
      ]).join(".");
    case "rob-slot":
      return prefixPe(parts.pe, [
        structuralName(parts.rob ?? "sperob"),
        `slot${structuralIndex(parts.slot)}`,
      ]).join(".");
    case "queue-slot":
      return prefixPe(parts.pe, [
        structuralName(parts.queue),
        `slot${structuralIndex(parts.slot)}`,
      ]).join(".");
    case "register":
      return prefixPe(parts.pe, [
        structuralName(parts.file),
        `reg${structuralIndex(parts.index)}`,
      ]).join(".");
    case "cell":
      return [
        `pe${structuralIndex(parts.pe)}`,
        "bg",
        `bank${structuralIndex(parts.bank)}`,
        `row${structuralIndex(parts.row)}`,
      ].join(".");
    case "xbar-lane":
      return prefixPe(parts.pe, [
        structuralName(parts.xbar),
        `lane${structuralIndex(parts.lane)}`,
      ]).join(".");
    case "cube-mac":
      return [
        `pe${structuralIndex(parts.pe)}`,
        "cube",
        "mac",
        `m${structuralIndex(parts.m)}`,
        `n${structuralIndex(parts.n)}`,
      ].join(".");
    case "stgbufb-subspace":
      return prefixPe(parts.pe, [
        "stgbufb",
        `subspace${structuralIndex(parts.subspace)}`,
      ]).join(".");
    case "pipe": {
      if (parts.path.length === 0) {
        throw new Error("structural pipe path must not be empty");
      }
      const [scope, ...path] = parts.path.map(structuralName);
      const segments = [scope, "pipe", ...path].filter(
        (segment): segment is string => segment !== undefined,
      );
      if (parts.lane !== undefined) {
        segments.push(`lane${structuralIndex(parts.lane)}`);
      }
      return segments.join(".");
    }
  }
}
