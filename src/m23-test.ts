// M23 gate: the budget circuit-breaker halts an autonomous loop before it runs
// past the token ceiling, records the halt as a schema-safe STUCK + budget-halt
// note, and the report counts it. With no cap set (the default) the loop is
// untouched. Offline.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runMilestone } from "./loop";
import { readLedger } from "./ledger";
import { buildReport } from "./report";
import { isBudgetHalt } from "./budget";
import type { Milestone } from "./types";

let ok = true;
function gate(name: string, cond: boolean) {
  console.log(`GATE ${name}: ${cond ? "PASS" : "FAIL"}`);
  if (!cond) ok = false;
}

function tmpRoot(tag: string): string {
  const dir = path.join(os.tmpdir(), `claude0-m23-${tag}-${process.pid}`);
  fs.mkdirSync(path.join(dir, ".claude0"), { recursive: true });
  return dir;
}

// A never-passing milestone that burns a fixed token cost per attempt. The
// metric increases each attempt so the no-improvement STUCK detector never
// fires — the loop runs until it either exhausts maxAttempts or hits the budget.
function burner(id: string, perAttempt: number): Milestone {
  return {
    id,
    maxAttempts: 10,
    run: (attempt: number) => ({
      pass: false,
      metric: attempt, // strictly increasing, never reaches success
      tokens_in: perAttempt,
      tokens_out: 0,
    }),
    success: (metric: number) => metric >= 1000,
  };
}

const CAP = 250;
const PER = 100;

async function run() {
  // 1. With a small cap, the loop HALTS with the internal BUDGET outcome before
  //    exhausting maxAttempts, and never spends past the cap.
  const capped = tmpRoot("capped");
  process.env.ZIPLINE_MAX_TOKENS = String(CAP);
  const outcome = await runMilestoneIn(capped, burner("cap-me", PER));
  const entries = readLedger(capped);
  const executed = entries.filter((e) => !isBudgetHalt(e.note));
  const spent = executed.reduce((s, e) => s + e.tokens_in + e.tokens_out, 0);

  gate("returns internal BUDGET outcome", outcome === "BUDGET");
  gate("halted before maxAttempts (didn't run all 10)", executed.length < 10);
  // The breaker can't know a step's cost before running it, so it may overshoot
  // by at most one step — but it must stop promptly once the cap is crossed.
  gate("stopped within one step of the cap", spent >= CAP && spent < CAP + PER);
  gate("logged a budget-halt note", entries.some((e) => isBudgetHalt(e.note)));
  gate("halt persisted as STUCK (schema-safe, not a new enum)", entries.every((e) => ["PASS", "FAIL", "STUCK"].includes(e.outcome)));

  const report = buildReport(entries);
  gate("report counts the budget halt", report.budgetHalts >= 1);

  // 2. With NO cap (default), the same burner runs to its natural STUCK end —
  //    zero behavior change.
  const uncapped = tmpRoot("uncapped");
  delete process.env.ZIPLINE_MAX_TOKENS;
  const outcome2 = await runMilestoneIn(uncapped, burner("free", 100));
  const entries2 = readLedger(uncapped);
  gate("no cap → not a budget halt", outcome2 !== "BUDGET");
  gate("no cap → no budget-halt notes", !entries2.some((e) => isBudgetHalt(e.note)));

  fs.rmSync(capped, { recursive: true, force: true });
  fs.rmSync(uncapped, { recursive: true, force: true });

  console.log(`M23 RESULT: ${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

// runMilestone logs via appendLedger(entry) with no repoRoot arg, which resolves
// the root by walking up from cwd (findClaudeZeroRoot). chdir into the temp root —
// which has its own .claude0/ — so entries land there and never touch the real
// project ledger. Restore cwd afterwards.
async function runMilestoneIn(root: string, m: Milestone) {
  const prevCwd = process.cwd();
  process.chdir(root);
  try {
    return await runMilestone(m);
  } finally {
    process.chdir(prevCwd);
  }
}

run();
