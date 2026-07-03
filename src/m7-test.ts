import { Tier, TIER_COST, TIER_ORDER } from "./policy";

function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Step *kinds* are portable across repos (a step's true difficulty comes from
// its kind, not the repo it lives in) -- this is the premise a shared policy
// is testing. Three repos, each with a different mix of step kinds.
interface StepKind {
  kind: string;
  passProb: Record<Tier, number>;
}

const KINDS: StepKind[] = [
  { kind: "context-compile", passProb: { haiku: 0.95, sonnet: 0.98, opus: 0.99 } },
  { kind: "structured-extract", passProb: { haiku: 0.9, sonnet: 0.97, opus: 0.99 } },
  { kind: "unit-test-write", passProb: { haiku: 0.6, sonnet: 0.92, opus: 0.97 } },
  { kind: "verify-output", passProb: { haiku: 0.5, sonnet: 0.88, opus: 0.96 } },
  { kind: "implement-small-fn", passProb: { haiku: 0.55, sonnet: 0.9, opus: 0.97 } },
  { kind: "design-synthesis", passProb: { haiku: 0.2, sonnet: 0.85, opus: 0.98 } },
];

const REPO_A_KINDS = ["context-compile", "structured-extract", "unit-test-write", "implement-small-fn", "design-synthesis"];
const REPO_B_KINDS = ["context-compile", "structured-extract", "unit-test-write", "verify-output", "implement-small-fn", "design-synthesis"]; // held-out repo; verify-output is the one truly unseen kind

function trainSharedPolicy(kinds: string[], rand: () => number, runsPerKind: number): Record<string, Tier> {
  const policy: Record<string, Tier> = {};
  for (const kindName of kinds) {
    const kind = KINDS.find((k) => k.kind === kindName)!;
    // start at haiku, promote using observed fail-rate from simulated runs
    let tier: Tier = "haiku";
    for (let attempt = 0; attempt < TIER_ORDER.length; attempt++) {
      let fails = 0;
      for (let i = 0; i < runsPerKind; i++) {
        if (rand() >= kind.passProb[tier]) fails++;
      }
      const failRate = fails / runsPerKind;
      // Leave margin below the 40% ceiling so a kind whose sampled fail-rate
      // lands right at the boundary doesn't get stuck one tier too cheap when
      // transferred to a repo with a different sample.
      if (failRate <= 0.3 || tier === "opus") break;
      tier = TIER_ORDER[TIER_ORDER.indexOf(tier) + 1];
    }
    policy[kindName] = tier;
  }
  return policy;
}

// Hand-written policy: a naive human default, always sonnet (no per-kind tuning).
function handWrittenPolicy(kinds: string[]): Record<string, Tier> {
  const policy: Record<string, Tier> = {};
  for (const k of kinds) policy[k] = "sonnet";
  return policy;
}

function evaluate(kinds: string[], policy: Record<string, Tier>, rand: () => number, runsPerKind: number) {
  let totalCost = 0;
  let passCount = 0;
  let total = 0;
  for (const kindName of kinds) {
    const kind = KINDS.find((k) => k.kind === kindName)!;
    const tier = policy[kindName];
    for (let i = 0; i < runsPerKind; i++) {
      const pass = rand() < kind.passProb[tier];
      totalCost += TIER_COST[tier];
      if (pass) passCount++;
      total++;
    }
  }
  return { totalCost, passRate: passCount / total };
}

function main() {
  const RUNS = 30;

  // Train shared policy on repo A only (repo B is held-out / never trained on).
  const trainRand = rng(11);
  const sharedPolicy = trainSharedPolicy(REPO_A_KINDS, trainRand, RUNS);
  console.log("shared policy (trained on repo A):", sharedPolicy);

  // repo B has kinds not in repo A's training set (verify-output,
  // implement-small-fn) -- shared policy falls back to sonnet default for
  // unseen kinds, same as any cold-start policy would.
  const fallbackTier: Tier = "sonnet";
  const sharedPolicyForB: Record<string, Tier> = {};
  for (const k of REPO_B_KINDS) {
    sharedPolicyForB[k] = sharedPolicy[k] ?? fallbackTier;
  }
  console.log("shared policy applied cold-start to repo B:", sharedPolicyForB);

  const handWrittenForB = handWrittenPolicy(REPO_B_KINDS);
  console.log("hand-written policy for repo B:", handWrittenForB);

  const evalRand1 = rng(55);
  const sharedResult = evaluate(REPO_B_KINDS, sharedPolicyForB, evalRand1, RUNS);
  const evalRand2 = rng(55);
  const handResult = evaluate(REPO_B_KINDS, handWrittenForB, evalRand2, RUNS);

  console.log(`shared cold-start on repo B: cost=${sharedResult.totalCost.toFixed(2)} passRate=${(sharedResult.passRate * 100).toFixed(1)}%`);
  console.log(`hand-written on repo B:      cost=${handResult.totalCost.toFixed(2)} passRate=${(handResult.passRate * 100).toFixed(1)}%`);

  const passParityOk = sharedResult.passRate >= handResult.passRate - 0.02;
  const cheaperOrEqualOk = sharedResult.totalCost <= handResult.totalCost;
  console.log(`GATE pass-rate parity: ${passParityOk ? "PASS" : "FAIL"}`);
  console.log(`GATE cold-start cost <= hand-written cost: ${cheaperOrEqualOk ? "PASS" : "FAIL"}`);

  const allOk = passParityOk && cheaperOrEqualOk;
  console.log(`M7 RESULT: ${allOk ? "PASS" : "FAIL"}`);
  process.exit(allOk ? 0 : 1);
}

main();
