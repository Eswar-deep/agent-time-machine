export type Action = { tool: string; arguments: Record<string, unknown> };
export type Check = { id: string; label: string; status: string; detail: string; group: string };
export type Outcome = { status: string; passed: number; total: number; checks: Check[]; scope: string };
export type Usage = { calls: number; total_tokens: number | null; known_tokens: number;
  cost_usd: number | null; cost_status: string; unknown_usage_calls: number; latency_ms: number };
export type Scenario = { id: string; title: string; category: string; description: string;
  request: string; injected_failure: string; hint: string; customer: string; initials: string };
export type RunSummary = { id: string; parent_id: string | null; created_at: string; scenario_id: string;
  title: string; mode: string; injected_failure: boolean; execution: string; outcome: Outcome;
  elapsed_ms: number; usage: Usage; replay: null | { status: string; observations_match: boolean; state_match: boolean;
    tool_errors: number; mismatches: unknown[] } };
export type RunEvent = { id: string; seq: number; kind: string; timestamp: string; inherited: boolean;
  source: string; content?: string; tool?: string; arguments?: Record<string, unknown>;
  checkpoint_id?: string | null; observation?: { ok: boolean; value?: unknown; error?: { type: string; message: string } };
  latency_ms?: number; model?: string; usage?: { total_tokens: number } | null };
export type Boundary = { id: string; sha256: string; event_boundary: number; tool: string; step: number };
export type Change = { path: string; before: unknown; after: unknown; before_exists: boolean; after_exists: boolean };
export type Run = RunSummary & { events: RunEvent[]; checkpoints: Boundary[]; error: string | null;
  patch: null | { before: Action; after: Action; provenance: { kind: string; failed_trace_access: boolean };
    context_rule: string; continuation: string };
  state_changes: Change[]; compatibility: { commit: string }; model_calls: unknown[] };
export type Checkpoint = { id: string; run_id: string; sha256: string; payload: {
  format_version: number; pending_action: Action; event_boundary: number; agent_state: { cursor: number };
  conversation: { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }[];
  environment: { orders: Record<string, unknown>; users: Record<string, unknown>; products: Record<string, unknown> };
  tools: { function: { name: string; description: string; parameters: unknown } }[];
  agent_config: { kind: string; model: string | null }; compatibility: { commit: string; application_hash: string };
} };
export type Health = { status: string; commit: string; validation_archive: string; model_ledger: Usage; meta: {
  available: boolean; blockers: string[]; model: string | null; max_calls: number; max_output_tokens: number;
  account_access: string; price_status: string; base_url: string;
} };
export type Comparison = { parent_id: string; branch_id: string; original_unchanged: boolean;
  parent_sha256: string; state_diff: Change[]; parent_outcome: Outcome; branch_outcome: Outcome;
  parent_usage: Usage; branch_usage: Usage; parent_elapsed_ms: number; branch_elapsed_ms: number; scope: string };
export type Proposal = { id: string; status: string; action: Action | null; explanation: string | null;
  failed_trace_access: boolean; error: string | null };

