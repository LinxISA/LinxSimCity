export const TRACE_CAPABILITIES = [
  "instruction-causality-v1",
  "physical-layout-v1",
  "shared-cache-v1",
  "cell-128b-v1",
  "tlsu-detail-v1",
] as const;

export type TraceCapability = (typeof TRACE_CAPABILITIES)[number];
export type TraceThreadId = 0 | 1 | 2 | 3;

export interface CausalPayload {
  instruction_id?: number;
  request_id?: number;
  thread_id: TraceThreadId;
  route_id?: string;
}

export interface DetailedInstructionPayload extends CausalPayload {
  instruction_id: number;
  pc: number;
  disassembly_id: string;
  bid?: number;
  rid?: number;
  rob_slot?: number;
  iq_slot?: number;
  stage_id?: string;
  issue_port?: number;
  pipe_id?: string;
  fu_kind?: string;
  reason?: string;
}

export interface DetailedRegisterPayload extends CausalPayload {
  phys_reg: number;
  port: number;
  role: "source" | "destination" | "prior-mapping";
  producer_id?: number;
  consumer_id?: number;
  ready?: boolean;
}

export interface DetailedCachePayload extends CausalPayload {
  request_id: number;
  cache_id: string;
  level: "l1i" | "l1d" | "l2";
  operation: "fetch" | "load" | "store" | "prefetch" | "writeback";
  address?: number;
  line_address: number;
  line_bytes: number;
  set: number;
  way?: number;
  tag: number;
  state?: string;
  sub_access_index?: number;
}

export interface DetailedCellPayload extends CausalPayload {
  request_id: number;
  phys_cell_id: number;
  pe: TraceThreadId;
  bank: number;
  row: number;
  byte_offset: number;
  bytes: number;
  operation: "read" | "write";
  source: "cube" | "vector" | "tlsu" | "gmma-mov";
  arbitration: "request" | "grant" | "conflict" | "serve";
  queue_id?: string;
  wait_cycles?: number;
  winner_request_id?: number;
  loser_request_ids?: number[];
}

export interface DetailedMemoryPayload extends CausalPayload {
  request_id: number;
  operation: "read" | "write" | "prefetch";
  stage_id: string;
  address: number;
  bytes: number;
  source_entity_id: string;
  destination_entity_id: string;
}

export interface DetailedPipePayload extends CausalPayload {
  route_id: string;
  start_cycle?: number;
  end_cycle?: number;
}

export interface ParseEventOptions {
  capabilities?: readonly string[] | undefined;
}
