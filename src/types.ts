export interface StepResult {
  pass: boolean;
  metric: number;
  tokens_in?: number;
  tokens_out?: number;
  baseline_tokens?: number;
  tier?: string;
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

export type LoopOutcome = "PASS" | "FAIL" | "STUCK";
