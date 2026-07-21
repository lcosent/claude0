// Budget circuit-breaker (M23). An autonomous loop can run unattended for a long
// time; without a ceiling, one runaway can burn a fortune. `CLAUDE0_MAX_TOKENS`
// sets a hard cumulative token ceiling — once cumulative tokens (in+out) reach
// it, the loop HALTS before starting the next expensive step instead of grinding
// on. Unset = no cap (the default; zero behavior change).
//
// A halt is recorded on the ledger as a normal STUCK entry with a `budget-halt:`
// note — deliberately NOT a new `outcome` enum value, so the frozen ledger schema
// stays backward-compatible (old readers still parse every line).

export const BUDGET_HALT_PREFIX = "budget-halt";

/** The cumulative-token cap from the environment, or null if unset/invalid. */
export function budgetLimitTokens(): number | null {
  // ZIPLINE_* is the pre-rename name, still honored so existing setups keep
  // working; CLAUDE0_* wins when both are set.
  const raw = process.env.CLAUDE0_MAX_TOKENS ?? process.env.ZIPLINE_MAX_TOKENS;
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function budgetHaltNote(spent: number, cap: number): string {
  return `${BUDGET_HALT_PREFIX}: spent=${spent} cap=${cap}`;
}

export function isBudgetHalt(note: string | undefined): boolean {
  return !!note && note.startsWith(BUDGET_HALT_PREFIX);
}
