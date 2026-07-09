// M22 gate: the shared router demotes on COST regression, not just failures.
// A step that PASSES but burns ballooning output tokens gets its effort cut
// first, and only drops a tier once effort is already at the floor. The old
// fail-rate escalation still fires (no regression of M2's behavior). Offline.

import { assessRoute, DEMOTE_WINDOW, OVERTHINK_RATIO } from "./router";

let ok = true;
function gate(name: string, cond: boolean) {
  console.log(`GATE ${name}: ${cond ? "PASS" : "FAIL"}`);
  if (!cond) ok = false;
}

const allPass = Array(DEMOTE_WINDOW).fill(true);
const mostlyFail = Array(DEMOTE_WINDOW).fill(false).map((_, i) => i < 3); // 70% fail

// 1. Reliability trigger unchanged: failing cheap tier escalates UP.
const esc = assessRoute(
  { tier: "haiku", effort: "low" },
  { outcomes: mostlyFail }
);
gate("fail-rate escalates tier up", esc.kind === "escalate-tier" && esc.to === "sonnet");

// 2. Overthinking with room on the effort axis → cut EFFORT first, not tier.
const over = assessRoute(
  { tier: "opus", effort: "high" },
  { outcomes: allPass, costs: Array(DEMOTE_WINDOW).fill(300), baselineCost: 100 }
);
gate("overthinking cuts effort first", over.kind === "reduce-effort" && over.to === "medium");
gate("effort-cut keeps the tier", over.kind === "reduce-effort");

// 3. Overthinking at the effort floor → step the TIER down.
const overFloor = assessRoute(
  { tier: "opus", effort: "low" },
  { outcomes: allPass, costs: Array(DEMOTE_WINDOW).fill(300), baselineCost: 100 }
);
gate("overthinking at low effort drops tier", overFloor.kind === "reduce-tier" && overFloor.to === "sonnet");

// 4. Fable overthinking steps down to opus (off-ladder handled).
const overFable = assessRoute(
  { tier: "fable", effort: "low" },
  { outcomes: allPass, costs: Array(DEMOTE_WINDOW).fill(300), baselineCost: 100 }
);
gate("fable overthinking drops to opus", overFable.kind === "reduce-tier" && overFable.to === "opus");

// 5. Healthy AND cheap → hold (no demotion when there's nothing wrong).
const healthy = assessRoute(
  { tier: "sonnet", effort: "medium" },
  { outcomes: allPass, costs: Array(DEMOTE_WINDOW).fill(100), baselineCost: 100 }
);
gate("healthy+cheap holds", healthy.kind === "hold");

// 6. Reliability beats cost: failing AND expensive → escalate, never cut cost.
const both = assessRoute(
  { tier: "haiku", effort: "high" },
  { outcomes: mostlyFail, costs: Array(DEMOTE_WINDOW).fill(999), baselineCost: 100 }
);
gate("failing+expensive escalates (reliability wins)", both.kind === "escalate-tier");

// 7. Partial window never acts.
const partial = assessRoute(
  { tier: "opus", effort: "high" },
  { outcomes: [true, true], costs: [500, 500], baselineCost: 100 }
);
gate("partial window holds", partial.kind === "hold");

// 8. Just below the overthink ratio → hold (threshold is real).
const below = assessRoute(
  { tier: "opus", effort: "high" },
  { outcomes: allPass, costs: Array(DEMOTE_WINDOW).fill(OVERTHINK_RATIO * 100 - 1), baselineCost: 100 }
);
gate("below overthink ratio holds", below.kind === "hold");

console.log(`M22 RESULT: ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
