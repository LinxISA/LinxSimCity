import type {
  InstructionTraceState,
  SerializedViewerSnapshot,
} from "@linxsimcity/trace-runtime";

function hex(value: number | undefined): string {
  return value === undefined ? "—" : `0x${value.toString(16).padStart(8, "0")}`;
}

function relatedPath(
  instruction: InstructionTraceState,
  snapshot: SerializedViewerSnapshot | undefined,
): string {
  if (!snapshot) return instruction.routeIds.join(" → ");
  const requests = new Map(snapshot.causal.requests);
  const parts = instruction.requestIds.flatMap((requestId) => {
    const request = requests.get(requestId);
    return request
      ? [...request.entityIds, ...request.cacheLineIds, ...request.cellIds]
      : [];
  });
  return [...instruction.routeIds, ...parts].filter(Boolean).join(" → ");
}

function InstructionTrace({
  label,
  instruction,
  snapshot,
}: {
  readonly label: string;
  readonly instruction: InstructionTraceState;
  readonly snapshot?: SerializedViewerSnapshot | undefined;
}) {
  return (
    <section className="instruction-trace" data-thread={instruction.threadId}>
      <strong>{label}</strong>
      <div>
        C{instruction.lastCycle} · T{instruction.threadId} · ROB{" "}
        {instruction.robSlot ?? "—"}
      </div>
      <div>
        {hex(instruction.pc)} · {instruction.disassemblyId ?? "unknown"}
      </div>
      <div>STAGE {instruction.stage}</div>
      <div>
        SRC{" "}
        {instruction.sourceRegisters.map((reg) => `p${reg}`).join(",") || "—"}
      </div>
      <div>
        DST{" "}
        {instruction.destinationRegisters.map((reg) => `p${reg}`).join(",") ||
          "—"}
      </div>
      <div className="trace-path">
        {relatedPath(instruction, snapshot) || "no routed dependency"}
      </div>
    </section>
  );
}

export function CommitHud({
  snapshot,
  liveCommit,
  pinnedInstructionId,
  recentCommits,
}: {
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly liveCommit?: InstructionTraceState | undefined;
  readonly pinnedInstructionId?: number | undefined;
  readonly recentCommits: readonly InstructionTraceState[];
}) {
  const pinned =
    pinnedInstructionId === undefined
      ? undefined
      : new Map(snapshot?.causal.instructions ?? []).get(pinnedInstructionId);
  return (
    <aside className="commit-hud" aria-label="Live commit trace">
      {liveCommit ? (
        <InstructionTrace
          label="LIVE COMMIT"
          instruction={liveCommit}
          snapshot={snapshot}
        />
      ) : (
        <section className="instruction-trace">
          <strong>LIVE COMMIT</strong>
          <div>waiting for retire</div>
        </section>
      )}
      {pinned ? (
        <InstructionTrace
          label="PINNED TRACE"
          instruction={pinned}
          snapshot={snapshot}
        />
      ) : null}
      <ol aria-label="Recent commits">
        {recentCommits.slice(0, 8).map((instruction) => (
          <li key={instruction.id} data-thread={instruction.threadId}>
            C{instruction.lastCycle} T{instruction.threadId} ROB
            {instruction.robSlot ?? "—"}{" "}
            {instruction.disassemblyId ?? "unknown"}
          </li>
        ))}
      </ol>
    </aside>
  );
}
