import { LedgerEntry } from "./ledger";
import { proposeChanges, computeStats, renderProposals } from "./learn";

// M14 — continuous-learning pipeline. Mines a FROZEN synthetic ledger and
// proposes rule changes deterministically. Proposals only; nothing is written.

function entry(inc: string[], exc: string[], pass: boolean): LedgerEntry {
  return {
    schema: 1,
    ts: "2026-01-01T00:00:00Z",
    milestone: "M1",
    step: "s",
    attempt: 1,
    tier: "n/a",
    tokens_in: 10,
    tokens_out: 0,
    baseline_tokens: 20,
    pass,
    metric: pass ? 1 : 0,
    outcome: pass ? "PASS" : "FAIL",
    retries: 0,
    rules_included: inc,
    rules_excluded: exc,
    note: "",
  };
}

function frozenLedger(): LedgerEntry[] {
  const e: LedgerEntry[] = [];
  // Two independent signals, kept disentangled (a rule only tallies when it
  // appears in rules_included/excluded — so leaving noise OUT of the failing
  // runs keeps its exclusion cleanly failure-free):
  //
  // "security": PIN — absent → fail, present → pass. 8 FAIL runs exclude it;
  //   16 PASS runs include it. Note noise is NOT mentioned in the fail runs.
  for (let i = 0; i < 8; i++) e.push(entry(["typescript"], ["security"], false));
  //
  // "noise": DE-PRIORITIZE — only ever appears excluded, always on PASSING runs
  //   (excl rate 100%, failWhenExcluded 0). Same 16 passing runs include security.
  for (let i = 0; i < 16; i++) e.push(entry(["typescript", "security"], ["noise"], true));
  return e;
}

function main() {
  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
    ok ? pass++ : fail++;
  };

  const ledger = frozenLedger();

  // 1. Stats computed correctly for a known rule.
  const stats = computeStats(ledger);
  const sec = stats.get("security")!;
  check(
    "stats: security excluded 8 (all fail) / included 16 (all pass)",
    sec.excluded === 8 && sec.failWhenExcluded === 8 && sec.included === 16 && sec.failWhenIncluded === 0
  );

  // 2. Proposals are non-empty on a ledger with clear signal.
  const proposals = proposeChanges(ledger);
  check("proposals: non-empty on signal-bearing ledger", proposals.length > 0, `${proposals.length} proposals`);

  // 3. security → PIN (its absence correlates with failure).
  check(
    "proposal: security PINned (absence correlates with failure)",
    proposals.some((p) => p.rule === "security" && p.kind === "pin")
  );

  // 4. noise → DE-PRIORITIZE (almost always excluded, never a failure cost).
  check(
    "proposal: noise DE-PRIORITIZED (excluded, no correctness cost)",
    proposals.some((p) => p.rule === "noise" && p.kind === "de-prioritize")
  );

  // 5. Deterministic: same ledger → identical proposals (order + content).
  const again = proposeChanges(ledger);
  check(
    "proposals: deterministic (same ledger → same output)",
    JSON.stringify(proposals) === JSON.stringify(again)
  );

  // 6. Thin ledger (below MIN_RUNS) → no proposals (needs evidence).
  const thin = [entry(["typescript"], ["noise"], true)];
  check("proposals: empty below evidence threshold", proposeChanges(thin).length === 0);

  // 7. renderProposals mentions the approval gate (nothing auto-written).
  check("render: states proposals are approval-gated", renderProposals(proposals).includes("--apply"));

  console.log("---");
  console.log(renderProposals(proposals).split("\n").slice(0, 6).join("\n"));
  console.log(`M14 RESULT: ${fail === 0 ? "PASS" : "FAIL"}  (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
