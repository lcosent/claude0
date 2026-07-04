import { appendLedger } from "./ledger";
import { Tier, TIER_COST, nextTier, Policy, effortForTier } from "./policy";
import { assessRoute } from "./router";

// Deterministic seeded RNG (mulberry32) so the simulation is reproducible.
function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface StepSpec {
  step: string;
  // ground-truth pass probability per tier for this step
  passProb: Record<string, number>; // escalation-ladder tiers only (haiku/sonnet/opus)
}

const STEPS: StepSpec[] = [
  { step: "context-compile", passProb: { haiku: 0.95, sonnet: 0.98, opus: 0.99 } },
  { step: "structured-extract", passProb: { haiku: 0.9, sonnet: 0.97, opus: 0.99 } },
  { step: "unit-test-write", passProb: { haiku: 0.6, sonnet: 0.92, opus: 0.97 } },
  { step: "verify-output", passProb: { haiku: 0.5, sonnet: 0.88, opus: 0.96 } },
  { step: "implement-small-fn", passProb: { haiku: 0.55, sonnet: 0.9, opus: 0.97 } },
  // seeded high-fail step: haiku fails >40% -> should trigger auto-demote
  { step: "design-synthesis", passProb: { haiku: 0.2, sonnet: 0.85, opus: 0.98 } },
];

const RUNS_PER_STEP = 10;
const AUTO_DEMOTE_THRESHOLD = 0.4;
const AUTO_DEMOTE_WINDOW = 10;

function startingPolicy(): Policy {
  return {
    "context-compile": "haiku",
    "structured-extract": "haiku",
    "unit-test-write": "sonnet",
    "verify-output": "sonnet",
    "implement-small-fn": "sonnet",
    "design-synthesis": "haiku", // deliberately under-tiered to prove auto-demote
  };
}

function simulateAttempt(step: StepSpec, tier: Tier, rand: () => number): boolean {
  return rand() < step.passProb[tier];
}

function runRouter(steps: StepSpec[], rand: () => number) {
  const policy = startingPolicy();
  const recentOutcomes: Record<string, boolean[]> = {};
  let totalCost = 0;
  let passCount = 0;
  let totalAttempts = 0;
  const demoteEvents: string[] = [];

  for (const step of steps) {
    recentOutcomes[step.step] = recentOutcomes[step.step] || [];
    for (let run = 0; run < RUNS_PER_STEP; run++) {
      let tier = policy[step.step];
      let pass = simulateAttempt(step, tier, rand);
      totalCost += TIER_COST[tier];
      totalAttempts++;
      let escalations = 0;

      while (!pass && tier !== "opus" && escalations < 2) {
        tier = nextTier(tier);
        pass = simulateAttempt(step, tier, rand);
        totalCost += TIER_COST[tier];
        totalAttempts++;
        escalations++;
      }

      if (pass) passCount++;

      const cheapTier = policy[step.step];
      const cheapPassedFirstTry = cheapTier === tier ? pass : false;
      const list = recentOutcomes[step.step];
      list.push(escalations === 0 ? pass : false); // cheap-tier fail if any escalation happened
      if (list.length > AUTO_DEMOTE_WINDOW) list.shift();

      appendLedger({
        ts: new Date().toISOString(),
        milestone: "M2",
        step: step.step,
        attempt: run + 1,
        tier,
        tokens_in: 100,
        tokens_out: 50,
        baseline_tokens: 0,
        pass,
        metric: pass ? 1 : 0,
        outcome: pass ? "PASS" : "FAIL",
        retries: escalations,
        rules_included: [],
        rules_excluded: [],
        note: `policy_tier=${policy[step.step]} final_tier=${tier}`,
      });

      if (list.length === AUTO_DEMOTE_WINDOW) {
        // Delegate the demote decision to the shared router (M22) — same
        // fail-rate rule, now one implementation for both sim and live loop.
        const action = assessRoute(
          { tier: policy[step.step], effort: effortForTier(policy[step.step]) },
          { outcomes: list }
        );
        if (action.kind === "escalate-tier") {
          policy[step.step] = action.to;
          demoteEvents.push(`${step.step}: ${action.from} -> ${action.to} (${action.detail})`);
          recentOutcomes[step.step] = [];
        }
      }
    }
  }

  return { totalCost, passRate: passCount / totalAttempts0(steps), demoteEvents, totalAttempts: steps.length * RUNS_PER_STEP };
}

// pass rate should be computed against number of *steps* run (one logical
// pass/fail per step invocation), not raw attempts (which include escalation retries).
function totalAttempts0(_steps: StepSpec[]) {
  return _steps.length * RUNS_PER_STEP;
}

function runAlwaysOpus(steps: StepSpec[], rand: () => number) {
  let totalCost = 0;
  let passCount = 0;
  for (const step of steps) {
    for (let run = 0; run < RUNS_PER_STEP; run++) {
      const pass = simulateAttempt(step, "opus", rand);
      totalCost += TIER_COST.opus;
      if (pass) passCount++;
    }
  }
  return { totalCost, passRate: passCount / (steps.length * RUNS_PER_STEP) };
}

function main() {
  const rand1 = rng(42);
  const router = runRouter(STEPS, rand1);
  const rand2 = rng(42); // same seed stream shape for a fair-ish comparison
  const opus = runAlwaysOpus(STEPS, rand2);

  console.log(`router: cost=${router.totalCost.toFixed(2)} passRate=${(router.passRate * 100).toFixed(1)}%`);
  console.log(`always-opus: cost=${opus.totalCost.toFixed(2)} passRate=${(opus.passRate * 100).toFixed(1)}%`);
  console.log(`cost ratio (router/opus): ${((router.totalCost / opus.totalCost) * 100).toFixed(1)}%`);
  console.log("auto-demote events:");
  router.demoteEvents.forEach((e) => console.log(`  - ${e}`));

  const passRateOk = router.passRate >= opus.passRate - 0.02;
  const cheaperOk = router.totalCost <= opus.totalCost * 0.6;
  const demoteOk = router.demoteEvents.some((e) => e.startsWith("design-synthesis"));

  console.log(`GATE pass-rate parity (>=opus-2pts): ${passRateOk ? "PASS" : "FAIL"}`);
  console.log(`GATE cost<=60% of opus: ${cheaperOk ? "PASS" : "FAIL"}`);
  console.log(`GATE auto-demote fired on seeded step: ${demoteOk ? "PASS" : "FAIL"}`);

  const allOk = passRateOk && cheaperOk && demoteOk;
  console.log(`M2 RESULT: ${allOk ? "PASS" : "FAIL"}`);
  process.exit(allOk ? 0 : 1);
}

main();
