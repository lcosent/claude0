import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { appendLedger } from "./ledger";
import { shouldDisable, resolveAvailability, detectRepoEnv } from "./integrations";
import { terseCapability } from "./integrations/terse";

// M12 — terse-output live auto-disable. terse shapes model OUTPUT, so its true
// net delta needs real calls (deferred). What M12 delivers and PROVES: the
// auto-disable mechanism is observable in `harness doctor` (resolveAvailability
// overlays disable state — the M8 gap where doctor ignored shouldDisable).

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-m12-"));
  fs.mkdirSync(path.join(dir, ".harness"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".harness", "ledger.jsonl"), "");
  return dir;
}

function seedTerse(repoRoot: string, netNegative: boolean, n: number) {
  for (let i = 0; i < n; i++) {
    appendLedger(
      {
        ts: new Date().toISOString(),
        milestone: "M4-BUILD",
        step: `build-seed-${i}`,
        attempt: 1,
        tier: "sonnet",
        tokens_in: 100,
        tokens_out: 200,
        baseline_tokens: 300,
        pass: true,
        metric: 1,
        outcome: "PASS",
        retries: 0,
        rules_included: [],
        rules_excluded: [],
        note: "seed",
        capabilities: [
          {
            name: "terse-output",
            tokens_before: 100,
            // net-negative: after > before (cost more than it saved)
            tokens_after: netNegative ? 160 : 60,
            source: "native",
            net_delta_exempt: false,
          },
        ],
      },
      repoRoot
    );
  }
}

function main() {
  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
    ok ? pass++ : fail++;
  };

  // 1. Healthy (net-positive) history → NOT disabled; doctor shows native.
  const good = makeTempRepo();
  seedTerse(good, false, 10);
  const goodEnv = detectRepoEnv(good);
  check("healthy terse history → shouldDisable false", shouldDisable("terse-output", good) === false);
  check(
    "healthy → doctor shows native (not disabled)",
    resolveAvailability(terseCapability, good, goodEnv).status === "native"
  );

  // 2. Net-negative history over the window → disabled; doctor shows disabled.
  const bad = makeTempRepo();
  seedTerse(bad, true, 10);
  const badEnv = detectRepoEnv(bad);
  check("net-negative terse history → shouldDisable true", shouldDisable("terse-output", bad) === true);
  const resolved = resolveAvailability(terseCapability, bad, badEnv);
  check(
    "net-negative → doctor shows 'disabled'",
    resolved.status === "disabled",
    `status=${resolved.status}`
  );
  check("disabled detail explains why", resolved.detail.includes("net-negative"));

  // 3. Below the window (too little data) → not disabled yet.
  const few = makeTempRepo();
  seedTerse(few, true, 3);
  check("net-negative but < window → not disabled yet", shouldDisable("terse-output", few) === false);

  // cleanup
  for (const d of [good, bad, few]) fs.rmSync(d, { recursive: true, force: true });

  console.log("---");
  console.log(`M12 RESULT: ${fail === 0 ? "PASS" : "FAIL"}  (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
