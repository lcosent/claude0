// Integrations layer shared types.
//
// A capability replicates an efficiency tool natively in TypeScript (always-on
// baseline) and optionally uses a real external tool as an accelerator when
// detected. ClaudeZero selects capabilities per step automatically — the user
// never picks one. See DESIGN.md and the M8 plan.

/**
 * Facts about the current repo, probed once and cached (DRY: symbol-query and
 * doc-fetch both need "is this a Node/TS repo?" — they read these flags rather
 * than each re-probing the filesystem).
 */
export interface RepoEnv {
  repoRoot: string;
  hasTsconfig: boolean; // symbol-query needs this
  hasNodeModules: boolean; // doc-fetch needs this
  rtkOnPath: boolean; // output-compress accelerator
  context7Configured: boolean; // doc-fetch: informational (user wires into Claude)
  lspMcpConfigured: boolean; // symbol-query: informational (user wires into Claude)
  gstackInstalled: boolean; // optional orchestration layer — detected, never invoked
}

/** How a capability runs in this repo, for `claude0 doctor`. */
export type CapabilityStatus =
  | "native" // native impl active
  | "accelerated" // native + a detected accelerator (e.g. rtk on PATH)
  | "inactive" // available in principle, but not for THIS repo (e.g. TS-only in a Python repo)
  | "disabled"; // auto-disabled because its net token delta went negative

export interface CapabilityAvailability {
  status: CapabilityStatus;
  detail: string; // human line for doctor, e.g. "native (TS repos only) — inactive here"
  accelerator?: string; // e.g. "rtk" when status is "accelerated"
  advisory?: string; // e.g. "Context7 MCP not configured" (user-wires-it note)
}

/**
 * Result of running a capability's transform. tokensBefore/After are input-side
 * token counts (via gpt-tokenizer's encode). decision-log sets
 * netDeltaExempt=true because it appends records rather than compressing.
 */
export interface CapabilityResult {
  name: string;
  output: string;
  tokensBefore: number;
  tokensAfter: number;
  source: "native" | "adapter";
  netDeltaExempt?: boolean;
}

export interface Capability {
  name: string;
  /** Tags that select this capability (empty = selected by an event, not tags). */
  triggerTags: string[];
  /** Whether this capability can run in the given repo (e.g. TS present). */
  availability(env: RepoEnv): CapabilityAvailability;
  /** Native transform. `input` is whatever the capability compresses/answers. */
  run(input: string, env: RepoEnv): CapabilityResult;
}
