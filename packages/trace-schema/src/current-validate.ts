import type {
  SimTraceCapability,
  SimTraceDiagnostic,
  SimTraceEvent,
  SimTraceEventType,
  SimTraceRun,
} from "./current-types.js";

const PHASE_ORDER: Readonly<Record<SimTraceEvent["phase"], number>> = {
  work: 0,
  xfer: 1,
  commit: 2,
  async: 3,
};

const CAPABILITY_BY_PREFIX: readonly [string, SimTraceCapability][] = [
  ["queue.", "queue-lifecycle"],
  ["tile.", "tile-residency"],
  ["link.", "instruction-link"],
  ["compute.", "compute-lifecycle"],
];

export interface ValidateSimTraceOptions {
  readonly topologyFingerprint: string;
  readonly topologyNodeIds: ReadonlySet<string>;
}

function payload(event: SimTraceEvent): Record<string, unknown> {
  return event.payload as Record<string, unknown>;
}

function requiredCapability(
  type: SimTraceEventType,
): SimTraceCapability | undefined {
  return CAPABILITY_BY_PREFIX.find(([prefix]) => type.startsWith(prefix))?.[1];
}

function orderKey(event: SimTraceEvent): readonly [bigint, number, number] {
  return [BigInt(event.cycle), PHASE_ORDER[event.phase], event.sequence];
}

function compareOrder(
  left: readonly [bigint, number, number],
  right: readonly [bigint, number, number],
): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]! < right[index]!) return -1;
    if (left[index]! > right[index]!) return 1;
  }
  return 0;
}

interface QueueTokenState {
  readonly queueId: string;
  readonly state: "accepted" | "visible";
}

interface ResidencyState {
  readonly tileId: string;
  readonly version: string;
}

export function validateSimTraceRun(
  run: SimTraceRun,
  options: ValidateSimTraceOptions,
): SimTraceDiagnostic[] {
  const diagnostics: SimTraceDiagnostic[] = [];
  const manifest = run.manifest;
  if (manifest.topologyFingerprint !== options.topologyFingerprint) {
    diagnostics.push({
      code: "manifest_mismatch",
      path: "manifest.topologyFingerprint",
      message: "trace topology fingerprint does not match the loaded topology",
    });
  }
  if (BigInt(manifest.eventCount) !== BigInt(run.events.length)) {
    diagnostics.push({
      code: "event_count",
      path: "manifest.eventCount",
      message: "manifest eventCount does not match parsed events",
    });
  }
  if (
    manifest.window.complete &&
    (manifest.loss.truncated || BigInt(manifest.loss.droppedEvents) > 0n)
  ) {
    diagnostics.push({
      code: "loss_contract",
      path: "manifest.loss",
      message:
        "a complete trace window cannot report truncation or dropped events",
    });
  }
  const capabilitySet = new Set(manifest.capabilities);
  const domainOrder = new Map(
    manifest.timeDomains.map((domain, index) => [domain.id, index]),
  );
  const firstCycle = BigInt(manifest.window.firstCycle);
  const lastCycle = BigInt(manifest.window.lastCycle);
  const queueTokens = new Map<string, QueueTokenState>();
  const residencies = new Map<string, ResidencyState>();
  const computations = new Set<string>();
  const previousOrderByDomain = new Map<
    string,
    readonly [bigint, number, number]
  >();

  run.events.forEach((event, index) => {
    const path = `events[${index}]`;
    const eventPayload = payload(event);
    const capability = requiredCapability(event.type);
    if (capability && !capabilitySet.has(capability)) {
      diagnostics.push({
        code: "missing_capability",
        path: `${path}.type`,
        message: `${event.type} requires capability ${capability}`,
      });
    }
    if (!domainOrder.has(event.timeDomain)) {
      diagnostics.push({
        code: "manifest_mismatch",
        path: `${path}.timeDomain`,
        message: "event references an undeclared time domain",
      });
    }
    const eventCycle = BigInt(event.cycle);
    if (eventCycle < firstCycle || eventCycle > lastCycle) {
      diagnostics.push({
        code: "cycle_out_of_window",
        path: `${path}.cycle`,
        message: "event cycle is outside the manifest window",
      });
    }
    const currentOrder = orderKey(event);
    const previousOrder = previousOrderByDomain.get(event.timeDomain);
    if (previousOrder) {
      const comparison = compareOrder(previousOrder, currentOrder);
      if (comparison === 0) {
        diagnostics.push({
          code: "duplicate_order_key",
          path,
          message: "event order key is duplicated",
        });
      } else if (comparison > 0) {
        diagnostics.push({
          code: "out_of_order",
          path,
          message: "events must follow cycle, phase, sequence order per domain",
        });
      }
    }
    previousOrderByDomain.set(event.timeDomain, currentOrder);
    if (!options.topologyNodeIds.has(event.entityId)) {
      diagnostics.push({
        code: "missing_entity",
        path: `${path}.entityId`,
        message: `event entity ${event.entityId} is absent from topology`,
      });
    }
    for (const field of [
      "producerNodeId",
      "consumerNodeId",
      "storageNodeId",
      "toStorageNodeId",
    ]) {
      const value = eventPayload[field];
      if (typeof value === "string" && !options.topologyNodeIds.has(value)) {
        diagnostics.push({
          code: "missing_entity",
          path: `${path}.payload.${field}`,
          message: `referenced entity ${value} is absent from topology`,
        });
      }
    }
    if (
      typeof eventPayload.occupancy === "number" &&
      typeof eventPayload.capacity === "number" &&
      eventPayload.occupancy > eventPayload.capacity
    ) {
      diagnostics.push({
        code: "queue_capacity",
        path: `${path}.payload.occupancy`,
        message: "queue occupancy exceeds capacity",
      });
    }

    const tokenId = eventPayload.tokenId;
    if (event.type === "queue.accept" && typeof tokenId === "string") {
      if (manifest.window.startsFromReset && queueTokens.has(tokenId)) {
        diagnostics.push({
          code: "queue_lifecycle",
          path,
          message: `token ${tokenId} is already resident in a queue`,
        });
      }
      queueTokens.set(tokenId, { queueId: event.entityId, state: "accepted" });
    }
    if (event.type === "queue.visible" && typeof tokenId === "string") {
      const state = queueTokens.get(tokenId);
      if (
        manifest.window.startsFromReset &&
        (!state ||
          state.queueId !== event.entityId ||
          state.state !== "accepted")
      ) {
        diagnostics.push({
          code: "queue_lifecycle",
          path,
          message: `token ${tokenId} became visible without matching acceptance`,
        });
      }
      queueTokens.set(tokenId, { queueId: event.entityId, state: "visible" });
    }
    if (
      (event.type === "queue.read" || event.type === "queue.cancel") &&
      typeof tokenId === "string"
    ) {
      const state = queueTokens.get(tokenId);
      const requiredState = event.type === "queue.read" ? "visible" : undefined;
      if (
        manifest.window.startsFromReset &&
        (!state ||
          state.queueId !== event.entityId ||
          (requiredState && state.state !== requiredState))
      ) {
        diagnostics.push({
          code: "queue_lifecycle",
          path,
          message: `token ${tokenId} has no matching queue residency`,
        });
      }
      queueTokens.delete(tokenId);
    }

    const residencyId = eventPayload.residencyId;
    const tileId = eventPayload.tileId;
    const version = eventPayload.version;
    if (
      event.type === "tile.allocate" &&
      typeof residencyId === "string" &&
      typeof tileId === "string" &&
      typeof version === "string"
    ) {
      if (manifest.window.startsFromReset && residencies.has(residencyId)) {
        diagnostics.push({
          code: "tile_lifecycle",
          path,
          message: `residency ${residencyId} is already allocated`,
        });
      }
      if (
        typeof eventPayload.fragmentIndex === "number" &&
        typeof eventPayload.fragmentCount === "number" &&
        eventPayload.fragmentIndex >= eventPayload.fragmentCount
      ) {
        diagnostics.push({
          code: "tile_lifecycle",
          path: `${path}.payload.fragmentIndex`,
          message: "fragmentIndex must be less than fragmentCount",
        });
      }
      residencies.set(residencyId, { tileId, version });
    }
    if (
      (event.type === "tile.read" || event.type === "tile.write") &&
      typeof residencyId === "string"
    ) {
      const state = residencies.get(residencyId);
      if (
        manifest.window.startsFromReset &&
        (!state || state.tileId !== tileId || state.version !== version)
      ) {
        diagnostics.push({
          code: "tile_lifecycle",
          path,
          message: `tile access references inactive residency ${residencyId}`,
        });
      }
    }
    if (event.type === "tile.move" && typeof residencyId === "string") {
      const state = residencies.get(residencyId);
      const toResidencyId = eventPayload.toResidencyId;
      if (
        typeof toResidencyId === "string" &&
        manifest.window.startsFromReset &&
        (!state || residencies.has(toResidencyId))
      ) {
        diagnostics.push({
          code: "tile_lifecycle",
          path,
          message:
            "tile move source is inactive or destination is already active",
        });
      }
      residencies.delete(residencyId);
      if (
        typeof toResidencyId === "string" &&
        typeof tileId === "string" &&
        typeof version === "string"
      ) {
        residencies.set(toResidencyId, { tileId, version });
      }
    }
    if (event.type === "tile.release" && typeof residencyId === "string") {
      const state = residencies.get(residencyId);
      if (
        manifest.window.startsFromReset &&
        (!state || state.tileId !== tileId || state.version !== version)
      ) {
        diagnostics.push({
          code: "tile_lifecycle",
          path,
          message: `tile release references inactive residency ${residencyId}`,
        });
      }
      residencies.delete(residencyId);
    }

    if (event.type === "compute.start" && typeof tokenId === "string") {
      if (manifest.window.startsFromReset && computations.has(tokenId)) {
        diagnostics.push({
          code: "compute_lifecycle",
          path,
          message: `compute token ${tokenId} is already executing`,
        });
      }
      computations.add(tokenId);
    }
    if (event.type === "compute.complete" && typeof tokenId === "string") {
      if (manifest.window.startsFromReset && !computations.has(tokenId)) {
        diagnostics.push({
          code: "compute_lifecycle",
          path,
          message: `compute token ${tokenId} completed without start`,
        });
      }
      computations.delete(tokenId);
    }
    if (event.type === "run.reset") {
      queueTokens.clear();
      residencies.clear();
      computations.clear();
    }
    if (event.type === "run.flush" && Array.isArray(eventPayload.tokenIds)) {
      for (const flushed of eventPayload.tokenIds) {
        if (typeof flushed === "string") {
          queueTokens.delete(flushed);
          computations.delete(flushed);
        }
      }
    }
  });
  return diagnostics;
}
