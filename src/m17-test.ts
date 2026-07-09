import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { appendLedger } from "./ledger";
import { shouldDisable, resolveAvailability, detectRepoEnv } from "./integrations";
import { measureTerseOutputDelta, terseABToLogEntry } from "./integrations/terse-ab";
import { terseCapability, TERSE_FRAGMENT } from "./integrations/terse";
import { ModelResponse } from "./llm";
import { Tier } from "./policy";

// M17 — terse-output live A/B output-delta measurement. terse's true payoff is
// SHORTER model output, invisible from the input side. This measures it with a
// paired no-terse-vs-terse run and feeds the signed OUTPUT delta into the same
// shouldDisable window M12 built — so a net-negative terse now trips on genuine
// output data, not a placeholder. The model call is injected for determinism.

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  cond ? pass++ : fail++;
}

// A stub model whose OUTPUT length depends on whether the terse fragment is
// present. `savings` > 0 → terse shortens output (good); < 0 → lengthens (bad).
function stubModel(savingsFraction: number) {
  return (prompt: string, _tier: Tier): ModelResponse => {
    const hasTerse = prompt.startsWith(TERSE_FRAGMENT);
    const baseTokens = 100;
    const tokens = hasTerse ? Math.round(baseTokens * (1 - savingsFraction)) : baseTokens;
    return { text: "x".repeat(tokens), tokens_out: tokens, source: "simulate" };
  };
}

// 1. terse SHORTENS output → positive delta.
const good = measureTerseOutputDelta("build the thing", "sonnet", stubModel(0.3));
check("terse shortens output → positive delta", good.delta > 0, `delta=${good.delta.toFixed(2)}`);
check("A/B records both arms", good.tokensWithout === 100 && good.tokensWith === 70, `${good.tokensWithout}→${good.tokensWith}`);

// 2. terse LENGTHENS output → negative delta (the auto-disable signal).
const bad = measureTerseOutputDelta("build the thing", "sonnet", stubModel(-0.5));
check("terse lengthens output → negative delta", bad.delta < 0, `delta=${bad.delta.toFixed(2)}`);

// 3. Empty baseline (no output) → delta 0, never a divide-by-zero.
const zero = measureTerseOutputDelta("", "sonnet", (_p, _t) => ({ text: "", tokens_out: 0, source: "simulate" }));
check("empty baseline → delta 0 (no div-by-zero)", zero.delta === 0);

// 4. The log entry encodes the OUTPUT-side delta: tokens_before = no-terse
//    output, tokens_after = terse output. A net-negative series must flip terse
//    to disabled via the EXISTING shouldDisable window (integration, not a new
//    mechanism).
function tempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude0-m17-"));
  fs.mkdirSync(path.join(dir, ".claude0"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude0", "ledger.jsonl"), "");
  return dir;
}

function seedFromAB(repoRoot: string, savingsFraction: number, n: number) {
  for (let i = 0; i < n; i++) {
    const ab = measureTerseOutputDelta(`step ${i}`, "sonnet", stubModel(savingsFraction));
    appendLedger(
      {
        ts: "2026-01-01T00:00:00Z",
        milestone: "M4-BUILD",
        step: `build-${i}`,
        attempt: 1,
        tier: "sonnet",
        tokens_in: 100,
        tokens_out: ab.tokensWith,
        baseline_tokens: 300,
        pass: true,
        metric: 1,
        outcome: "PASS",
        retries: 0,
        rules_included: [],
        rules_excluded: [],
        note: "m17 A/B",
        capabilities: [terseABToLogEntry(ab)],
      },
      repoRoot
    );
  }
}

// Net-negative A/B history (terse lengthens output every run) → disabled.
const badRepo = tempRepo();
seedFromAB(badRepo, -0.5, 10);
const badEnv = detectRepoEnv(badRepo);
check("net-negative A/B history → shouldDisable true", shouldDisable("terse-output", badRepo) === true);
check(
  "net-negative A/B → doctor shows disabled",
  resolveAvailability(terseCapability, badRepo, badEnv).status === "disabled"
);

// Net-positive A/B history (terse shortens output) → stays enabled.
const goodRepo = tempRepo();
seedFromAB(goodRepo, 0.3, 10);
check("net-positive A/B history → shouldDisable false", shouldDisable("terse-output", goodRepo) === false);

for (const d of [badRepo, goodRepo]) fs.rmSync(d, { recursive: true, force: true });

console.log(`\nM17 RESULT: ${fail === 0 ? "PASS" : "FAIL"}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
