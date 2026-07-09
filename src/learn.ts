import { readLedger, LedgerEntry } from "./ledger";

// Continuous-learning pipeline (DESIGN §4.5 cross-session loop). Reads the
// ledger and PROPOSES rule changes — never writes silently. Two evidence-based
// signals:
//   1. de-prioritize: a rule almost always in rules_excluded with no correctness
//      cost (excluding it never coincided with a failure) → likely dead weight.
//   2. pin: a rule whose ABSENCE correlates with failures (fail-rate is much
//      higher on runs that excluded it than on runs that included it) → likely
//      load-bearing; pin it so the compiler stops dropping it.
// Deterministic: same ledger → same proposals (sorted, thresholded).

export type ProposalKind = "de-prioritize" | "pin";

export interface Proposal {
  kind: ProposalKind;
  rule: string;
  evidence: string;
  confidence: number; // 0..1
}

const MIN_RUNS = 5; // need enough observations to propose
const DEPRIORITIZE_EXCL_RATE = 0.8; // excluded in >=80% of runs
const PIN_FAILRATE_GAP = 0.3; // absence fail-rate exceeds presence by >=30pts

interface RuleStats {
  included: number;
  excluded: number;
  failWhenIncluded: number;
  failWhenExcluded: number;
}

export function computeStats(entries: LedgerEntry[]): Map<string, RuleStats> {
  const stats = new Map<string, RuleStats>();
  const get = (r: string): RuleStats => {
    let s = stats.get(r);
    if (!s) {
      s = { included: 0, excluded: 0, failWhenIncluded: 0, failWhenExcluded: 0 };
      stats.set(r, s);
    }
    return s;
  };
  // Only consider entries that actually did rule selection (compile-like steps).
  for (const e of entries) {
    const inc = e.rules_included ?? [];
    const exc = e.rules_excluded ?? [];
    if (inc.length === 0 && exc.length === 0) continue;
    const failed = !e.pass;
    for (const r of inc) {
      const s = get(r);
      s.included++;
      if (failed) s.failWhenIncluded++;
    }
    for (const r of exc) {
      const s = get(r);
      s.excluded++;
      if (failed) s.failWhenExcluded++;
    }
  }
  return stats;
}

export function proposeChanges(entries: LedgerEntry[] = readLedger()): Proposal[] {
  const stats = computeStats(entries);
  const proposals: Proposal[] = [];

  for (const [rule, s] of stats) {
    const total = s.included + s.excluded;
    if (total < MIN_RUNS) continue;

    const exclRate = s.excluded / total;
    const failRateExcluded = s.excluded > 0 ? s.failWhenExcluded / s.excluded : 0;
    const failRateIncluded = s.included > 0 ? s.failWhenIncluded / s.included : 0;

    // 1. de-prioritize: nearly always excluded AND excluding it never hurt.
    if (exclRate >= DEPRIORITIZE_EXCL_RATE && s.failWhenExcluded === 0) {
      proposals.push({
        kind: "de-prioritize",
        rule,
        evidence: `excluded in ${s.excluded}/${total} runs, 0 failures when excluded`,
        confidence: Math.min(1, exclRate),
      });
      continue;
    }

    // 2. pin: absence correlates with failure (and we have both cases to compare).
    if (
      s.included > 0 &&
      s.excluded > 0 &&
      failRateExcluded - failRateIncluded >= PIN_FAILRATE_GAP
    ) {
      proposals.push({
        kind: "pin",
        rule,
        evidence: `fail-rate ${(failRateExcluded * 100).toFixed(0)}% when excluded vs ${(failRateIncluded * 100).toFixed(0)}% when included`,
        confidence: Math.min(1, failRateExcluded - failRateIncluded),
      });
    }
  }

  // Deterministic ordering: kind then rule name.
  proposals.sort((a, b) => (a.kind + a.rule).localeCompare(b.kind + b.rule));
  return proposals;
}

/** Render proposals as a human-reviewable diff-style block. */
export function renderProposals(proposals: Proposal[]): string {
  if (proposals.length === 0) return "No proposals — ledger shows no actionable rule signal yet.";
  const lines = [`${proposals.length} rule proposal(s) from ledger evidence:`, ""];
  for (const p of proposals) {
    const sign = p.kind === "pin" ? "+ PIN" : "- DEPRIORITIZE";
    lines.push(`${sign}  ${p.rule}`);
    lines.push(`    evidence: ${p.evidence}  (confidence ${(p.confidence * 100).toFixed(0)}%)`);
  }
  lines.push("");
  lines.push("These are proposals only. Re-run with --apply to write (requires approval).");
  return lines.join("\n");
}
