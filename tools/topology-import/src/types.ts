export interface QueuePlanQueue {
  readonly name: string;
  readonly scope: string;
  readonly depth: number;
  readonly latency: number;
  readonly rate: number;
  readonly payload_type: string;
}

export interface QueuePlanBlock {
  readonly name: string;
  readonly kind: string;
  readonly scope: string;
  readonly lexical_order: number;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly capacity: number;
  readonly resources: number;
  readonly latencies: readonly number[];
}

export interface AgenticQueuePlan {
  readonly schema: "agentic-circuit-queue-graph-plan";
  readonly version: string;
  readonly contract_epoch: string;
  readonly system: string;
  readonly scopes: readonly string[];
  readonly queues: readonly QueuePlanQueue[];
  readonly blocks: readonly QueuePlanBlock[];
}

export interface QueuePlanProvenance {
  readonly repository: string;
  readonly revision: string;
  readonly worktreeDirty: boolean;
  readonly relevantInputsDirty: boolean;
  readonly planSha256: string;
  readonly modelSha256: string;
}

export interface DavinciCatalogProvenance {
  readonly repository: string;
  readonly revision: string;
  readonly catalogPath: string;
  readonly catalogSha256: string;
  readonly treeManifestSha256: string;
}
