import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { summarize } from "./ledger-summary";

const LEDGER_PATH = path.join(process.cwd(), ".harness", "ledger.jsonl");

function seed() {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  const rows = [
    { ts: "t", milestone: "test-m", step: "a", attempt: 1, tier: "n/a", tokens_in: 10, tokens_out: 5, baseline_tokens: 0, pass: true, metric: 1, outcome: "PASS", retries: 0, rules_included: [], rules_excluded: [], note: "" },
    { ts: "t", milestone: "test-m", step: "b", attempt: 1, tier: "n/a", tokens_in: 20, tokens_out: 8, baseline_tokens: 0, pass: false, metric: 0, outcome: "FAIL", retries: 0, rules_included: [], rules_excluded: [], note: "" },
  ];
  fs.writeFileSync(LEDGER_PATH, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

function main() {
  seed();
  const summary = summarize();
  const testM = summary.find((s) => s.milestone === "test-m");
  assert.ok(testM, "expected test-m summary to exist");
  assert.strictEqual(testM!.attempts, 2);
  assert.strictEqual(testM!.passes, 1);
  assert.strictEqual(testM!.passRate, 0.5);
  assert.strictEqual(testM!.totalTokensIn, 30);
  assert.strictEqual(testM!.totalTokensOut, 13);
  console.log("ledger-summary.test.ts: all assertions passed");
}

main();
