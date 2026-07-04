// M20 gate: Fable tier exists and is wired for cost/routing, but the escalation
// ladder can NEVER promote a step into it (Fable is the architect tier, assigned
// by policy only). Proven offline — no subscription needed.

import { Tier, ALL_TIERS, TIER_ORDER, TIER_COST, nextTier } from "./policy";
import { parsePolicy } from "./policy-sync";
import { callModel } from "./llm";

let ok = true;
function gate(name: string, cond: boolean) {
  console.log(`GATE ${name}: ${cond ? "PASS" : "FAIL"}`);
  if (!cond) ok = false;
}

// 1. fable is a first-class tier in cost + report ordering.
gate("fable in ALL_TIERS", ALL_TIERS.includes("fable"));
gate("fable has a cost", typeof TIER_COST.fable === "number");

// 2. fable is the most expensive tier (2x opus per the article).
gate("fable cost > opus", TIER_COST.fable > TIER_COST.opus);

// 3. fable is OFF the escalation ladder — a stalled mechanical step must never
//    climb into the architect tier from any starting point.
const reachable = new Set<Tier>();
for (const start of ALL_TIERS) {
  let t = start;
  for (let i = 0; i < 6; i++) {
    t = nextTier(t);
    reachable.add(t);
  }
}
gate("escalation never reaches fable", !reachable.has("fable"));
gate("TIER_ORDER excludes fable (ladder caps at opus)", !TIER_ORDER.includes("fable"));
gate("nextTier(opus) === opus (ceiling)", nextTier("opus") === "opus");
gate("nextTier(fable) caps to opus (off-ladder safe)", nextTier("fable") === "opus");

// 4. Policy can ASSIGN fable to a planning step, and callModel accepts it.
const policy = parsePolicy("design-synthesis: fable\ncontext-compile: haiku\n");
gate("parsePolicy accepts fable", policy["design-synthesis"] === "fable");
const resp = callModel("synthesize the design", "fable");
gate("callModel routes fable", /fable/.test(resp.text) || resp.source === "claude-cli");

console.log(`M20 RESULT: ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
