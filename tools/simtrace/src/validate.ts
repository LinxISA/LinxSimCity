import {
  parseSimTraceEvents,
  parseSimTraceManifest,
  validateSimTraceRun,
} from "@linxsimcity/trace-schema";
import type {
  SimTraceDiagnostic,
  SimTraceRun,
} from "@linxsimcity/trace-schema";
import {
  topologyFingerprint,
  validateArchitectureTopology,
} from "@linxsimcity/world";
import type { ArchitectureTopology } from "@linxsimcity/world";

interface RunDocument {
  readonly manifest: unknown;
  readonly events: readonly unknown[];
}

function runDocument(value: unknown): RunDocument {
  if (!value || typeof value !== "object") {
    throw new Error("simulation trace document must be an object");
  }
  const candidate = value as Partial<RunDocument>;
  if (!candidate.manifest || !Array.isArray(candidate.events)) {
    throw new Error("simulation trace document requires manifest and events");
  }
  return { manifest: candidate.manifest, events: candidate.events };
}

function topologyDocument(value: unknown): ArchitectureTopology {
  if (!value || typeof value !== "object") {
    throw new Error("topology document must be an object");
  }
  const candidate = value as Partial<ArchitectureTopology>;
  if (
    candidate.schema !== "linxsimcity.topology" ||
    candidate.schemaVersion !== "1" ||
    !Array.isArray(candidate.nodes) ||
    !Array.isArray(candidate.edges)
  ) {
    throw new Error("topology document is not the current LinxSimCity format");
  }
  return candidate as ArchitectureTopology;
}

export interface SimTraceValidationResult {
  readonly run: SimTraceRun;
  readonly topology: ArchitectureTopology;
  readonly diagnostics: readonly SimTraceDiagnostic[];
}

export function validateRunDocument(
  runValue: unknown,
  topologyValue: unknown,
): SimTraceValidationResult {
  const sourceRun = runDocument(runValue);
  const topology = topologyDocument(topologyValue);
  const topologyDiagnostics = validateArchitectureTopology(
    topology,
    CORE_CATALOG,
  );
  if (topologyDiagnostics.length > 0) {
    throw new Error(
      `invalid topology: ${topologyDiagnostics[0]!.path} ${topologyDiagnostics[0]!.message}`,
    );
  }
  const run: SimTraceRun = {
    manifest: parseSimTraceManifest(sourceRun.manifest),
    events: parseSimTraceEvents(sourceRun.events),
  };
  return {
    run,
    topology,
    diagnostics: validateSimTraceRun(run, {
      topologyFingerprint: topologyFingerprint(topology),
      topologyNodeIds: new Set(topology.nodes.map((node) => node.id)),
    }),
  };
}
import { CORE_CATALOG } from "@linxsimcity/component-catalog";
