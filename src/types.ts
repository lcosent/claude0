export interface StepResult {
  pass: boolean;
  metric: number;
  tokens_in?: number;
  tokens_out?: number;
  baseline_tokens?: number;
  tier?: string;
  effort?: string;
  rules_included?: string[];
  rules_excluded?: string[];
  note?: string;
}

export interface Milestone {
  id: string;
  maxAttempts: number;
  /** Runs one attempt; attempt number is 1-indexed. */
  run: (attempt: number) => Promise<StepResult> | StepResult;
  /** True if metric satisfies the milestone's success criterion. */
  success: (metric: number) => boolean;
}

// "BUDGET" is an INTERNAL outcome only — the loop returns it to signal a
// budget-cap halt. It is never written to the ledger (which stays PASS/FAIL/STUCK
// per the frozen schema); a halt persists as STUCK + a budget-halt note.
export type LoopOutcome = "PASS" | "FAIL" | "STUCK" | "BUDGET";
