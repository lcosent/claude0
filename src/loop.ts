import { appendLedger } from "./ledger";
import type { Milestone, LoopOutcome } from "./types";

const NO_IMPROVEMENT_STOP = 2;

export async function runMilestone(m: Milestone): Promise<LoopOutcome> {
  let lastMetric: number | null = null;
  let noImprovementStreak = 0;

  for (let attempt = 1; attempt <= m.maxAttempts; attempt++) {
    const result = await m.run(attempt);
    const pass = m.success(result.metric);
    const outcome: LoopOutcome = pass ? "PASS" : "FAIL";

    if (!pass && lastMetric !== null && result.metric === lastMetric) {
      noImprovementStreak++;
    } else {
      noImprovementStreak = 0;
    }
    lastMetric = result.metric;

    const stuck = !pass && noImprovementStreak >= NO_IMPROVEMENT_STOP;

    appendLedger({
      ts: new Date().toISOString(),
      milestone: m.id,
      step: m.id,
      attempt,
      tier: result.tier ?? "n/a",
      tokens_in: result.tokens_in ?? 0,
      tokens_out: result.tokens_out ?? 0,
      baseline_tokens: result.baseline_tokens ?? 0,
      pass: result.pass,
      metric: result.metric,
      outcome: stuck ? "STUCK" : outcome,
      retries: attempt - 1,
      rules_included: result.rules_included ?? [],
      rules_excluded: result.rules_excluded ?? [],
      note: result.note ?? "",
    });

    if (pass) return "PASS";
    if (stuck) return "STUCK";
  }
  return "STUCK";
}
