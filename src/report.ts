import { readLedger, LedgerEntry } from "./ledger";
import { isBudgetHalt } from "./budget";

export interface ReportTotals {
  totalRuns: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalBaselineTokens: number;
  passCount: number;
  escalationCount: number; // retries > 0
  stuckCount: number;
  budgetHalts: number; // STUCK entries caused by the budget breaker (M23)
  tierMix: Record<string, number>;
  effortMix: Record<string, number>; // reasoning-effort distribution (M21)
  savingsByMilestone: Record<string, number[]>; // ordered savings ratio series
}

function savingsRatio(e: LedgerEntry): number | null {
  if (e.baseline_tokens <= 0) return null;
  return (e.baseline_tokens - e.tokens_in) / e.baseline_tokens;
}

export function buildReport(entries: LedgerEntry[] = readLedger()): ReportTotals {
  const totals: ReportTotals = {
    totalRuns: entries.length,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalBaselineTokens: 0,
    passCount: 0,
    escalationCount: 0,
    stuckCount: 0,
    budgetHalts: 0,
    tierMix: {},
    effortMix: {},
    savingsByMilestone: {},
  };

  for (const e of entries) {
    totals.totalTokensIn += e.tokens_in;
    totals.totalTokensOut += e.tokens_out;
    totals.totalBaselineTokens += e.baseline_tokens;
    if (e.pass) totals.passCount++;
    if (e.retries > 0) totals.escalationCount++;
    if (e.outcome === "STUCK") totals.stuckCount++;
    if (isBudgetHalt(e.note)) totals.budgetHalts++;
    totals.tierMix[e.tier] = (totals.tierMix[e.tier] ?? 0) + 1;
    if (e.effort) totals.effortMix[e.effort] = (totals.effortMix[e.effort] ?? 0) + 1;

    const ratio = savingsRatio(e);
    if (ratio !== null) {
      totals.savingsByMilestone[e.milestone] = [
        ...(totals.savingsByMilestone[e.milestone] ?? []),
        ratio,
      ];
    }
  }

  return totals;
}

/** Detects a savings regression: any point in the trend drops below `floor`. */
export function detectRegression(series: number[], floor = 0.3): number[] {
  return series
    .map((ratio, i) => (ratio < floor ? i : -1))
    .filter((i) => i !== -1);
}

export function reconciles(report: ReportTotals, entries: LedgerEntry[]): boolean {
  const rawTokensIn = entries.reduce((sum, e) => sum + e.tokens_in, 0);
  const rawTokensOut = entries.reduce((sum, e) => sum + e.tokens_out, 0);
  const rawPass = entries.filter((e) => e.pass).length;
  return (
    report.totalTokensIn === rawTokensIn &&
    report.totalTokensOut === rawTokensOut &&
    report.passCount === rawPass &&
    report.totalRuns === entries.length
  );
}

if (require.main === module) {
  const entries = readLedger();
  const report = buildReport(entries);
  console.log(`total runs: ${report.totalRuns}`);
  console.log(`pass: ${report.passCount} (${((report.passCount / report.totalRuns) * 100).toFixed(1)}%)`);
  console.log(`escalations: ${report.escalationCount}, stuck: ${report.stuckCount}, budget-halts: ${report.budgetHalts}`);
  console.log(`tier mix:`, report.tierMix);
  console.log(`effort mix:`, report.effortMix);
  console.log(`tokens_in total: ${report.totalTokensIn}, tokens_out total: ${report.totalTokensOut}`);
  for (const [milestone, series] of Object.entries(report.savingsByMilestone)) {
    console.log(`${milestone} savings trend: ${series.map((s) => (s * 100).toFixed(0) + "%").join(", ")}`);
    const regressions = detectRegression(series);
    if (regressions.length > 0) {
      console.log(`  regression detected at index(es): ${regressions.join(", ")}`);
    }
  }
}
