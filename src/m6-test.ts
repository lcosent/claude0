import * as fs from "fs";
import * as path from "path";
import { readLedger, LedgerEntry } from "./ledger";
import { buildReport, detectRegression, reconciles } from "./report";

const LEDGER_PATH = path.join(process.cwd(), ".harness", "ledger.jsonl");

function seedRow(over: Partial<LedgerEntry>): LedgerEntry {
  return {
    ts: "t",
    milestone: "m6-test",
    step: "s",
    attempt: 1,
    tier: "haiku",
    tokens_in: 70,
    tokens_out: 20,
    baseline_tokens: 100,
    pass: true,
    metric: 0.3,
    outcome: "PASS",
    retries: 0,
    rules_included: [],
    rules_excluded: [],
    note: "",
    ...over,
  };
}

function main() {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  const rows: LedgerEntry[] = [
    seedRow({ tokens_in: 70, baseline_tokens: 100 }), // savings 0.30
    seedRow({ tokens_in: 60, baseline_tokens: 100 }), // savings 0.40
    seedRow({ tokens_in: 50, baseline_tokens: 100 }), // savings 0.50
    seedRow({ tokens_in: 90, baseline_tokens: 100, note: "seeded regression" }), // savings 0.10 <- regression
    seedRow({ tokens_in: 55, baseline_tokens: 100, tier: "sonnet", retries: 1 }), // savings 0.45, escalation
  ];
  fs.writeFileSync(LEDGER_PATH, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

  const entries = readLedger();
  const report = buildReport(entries);

  const ok1 = reconciles(report, entries);
  console.log(`GATE report reconciles with raw ledger sums: ${ok1 ? "PASS" : "FAIL"}`);

  const series = report.savingsByMilestone["m6-test"];
  const regressions = detectRegression(series, 0.3);
  // index 3 is the seeded 0.10-savings row; detectRegression uses `< floor`
  // so 0.30 itself (index 0) does not count as a regression.
  const ok2 = regressions.includes(3) && regressions.length === 1;
  console.log(`series: ${series.map((s) => (s * 100).toFixed(0) + "%").join(", ")}`);
  console.log(`GATE seeded regression visible at index 3 only: ${ok2 ? "PASS" : "FAIL"}`);

  const expectedTokensIn = 70 + 60 + 50 + 90 + 55;
  const ok3 = report.totalTokensIn === expectedTokensIn && report.totalRuns === 5 && report.passCount === 5 && report.escalationCount === 1;
  console.log(`GATE every ledger metric appears correctly: ${ok3 ? "PASS" : "FAIL"}`);

  const allOk = ok1 && ok2 && ok3;
  console.log(`M6 RESULT: ${allOk ? "PASS" : "FAIL"}`);
  process.exit(allOk ? 0 : 1);
}

main();
