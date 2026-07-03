import { readLedger } from "./ledger";

export interface MilestoneSummary {
  milestone: string;
  attempts: number;
  passes: number;
  passRate: number;
  totalTokensIn: number;
  totalTokensOut: number;
}

export function summarize(): MilestoneSummary[] {
  const entries = readLedger();
  const byMilestone = new Map<string, MilestoneSummary>();

  for (const e of entries) {
    const s =
      byMilestone.get(e.milestone) ??
      {
        milestone: e.milestone,
        attempts: 0,
        passes: 0,
        passRate: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
      };
    s.attempts++;
    if (e.pass) s.passes++;
    s.totalTokensIn += e.tokens_in;
    s.totalTokensOut += e.tokens_out;
    byMilestone.set(e.milestone, s);
  }

  return Array.from(byMilestone.values()).map((s) => ({
    ...s,
    passRate: s.attempts === 0 ? 0 : s.passes / s.attempts,
  }));
}

if (require.main === module) {
  for (const s of summarize()) {
    console.log(
      `${s.milestone.padEnd(20)} attempts=${s.attempts} passRate=${(s.passRate * 100).toFixed(1)}% tokens_in=${s.totalTokensIn} tokens_out=${s.totalTokensOut}`
    );
  }
}
