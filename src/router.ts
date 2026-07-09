import {
  Tier,
  Effort,
  nextTier,
  prevTier,
  lowerEffort,
} from "./policy";

// The shared routing-decision module. Historically the auto-demote rule lived
// inline in the M2 simulation; this extracts it so both the sim and any live
// control loop apply the SAME policy, and adds a second trigger the fail-rate
// rule was blind to: "overthinking" — a tier that PASSES but at ballooning
// output cost. The two triggers move in opposite directions:
//
//   • reliability (fail-rate high) → escalate to a MORE capable tier
//   • overthinking (passing, expensive) → cut cost: drop EFFORT first, then TIER
//
// Reliability wins ties: a step that fails too often is never made cheaper.

export const DEMOTE_WINDOW = 10; // decisions act on a full rolling window
export const DEMOTE_FAILRATE = 0.4; // fail-rate above this → escalate tier
export const HEALTHY_FAILRATE = 0.1; // at/below this → safe to cut cost
export const OVERTHINK_RATIO = 1.5; // median cost ≥ ratio×baseline → overthinking

export interface RouteState {
  tier: Tier;
  effort: Effort;
}

export interface WindowStats {
  /** Cheap-tier pass/fail for each run in the rolling window. */
  outcomes: boolean[];
  /** tokens_out per run in the window (for the overthinking trigger). */
  costs?: number[];
  /** The step's established output-cost baseline (median of a healthy period). */
  baselineCost?: number;
}

export type RouteAction =
  | { kind: "hold"; detail: string }
  | { kind: "escalate-tier"; from: Tier; to: Tier; reason: "fail-rate"; detail: string }
  | { kind: "reduce-effort"; from: Effort; to: Effort; reason: "overthinking"; detail: string }
  | { kind: "reduce-tier"; from: Tier; to: Tier; reason: "overthinking"; detail: string };

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function failRate(outcomes: boolean[]): number {
  if (outcomes.length === 0) return 0;
  return outcomes.filter((x) => !x).length / outcomes.length;
}

/**
 * Decide what to do with a step's routing given its recent window. Pure and
 * deterministic — callers apply the returned action to the policy and reset the
 * window. Returns "hold" until the window is full.
 */
export function assessRoute(state: RouteState, w: WindowStats): RouteAction {
  if (w.outcomes.length < DEMOTE_WINDOW) {
    return { kind: "hold", detail: "window not full" };
  }

  const fr = failRate(w.outcomes);

  // 1. Reliability first: failing too often → escalate the tier (capped at opus
  //    by nextTier; never promotes into fable).
  if (fr > DEMOTE_FAILRATE) {
    const to = nextTier(state.tier);
    if (to !== state.tier) {
      return {
        kind: "escalate-tier",
        from: state.tier,
        to,
        reason: "fail-rate",
        detail: `fail-rate ${(fr * 100).toFixed(0)}%`,
      };
    }
    return { kind: "hold", detail: "failing but already at opus" };
  }

  // 2. Overthinking: quality is healthy but output cost has ballooned. Cut cost —
  //    effort before tier (reduce thinking before switching models).
  const healthy = fr <= HEALTHY_FAILRATE;
  const cost = median(w.costs ?? []);
  const overthinking =
    healthy &&
    w.baselineCost !== undefined &&
    w.baselineCost > 0 &&
    cost >= OVERTHINK_RATIO * w.baselineCost;

  if (overthinking) {
    const detail = `median out ${cost.toFixed(0)} ≥ ${OVERTHINK_RATIO}× baseline ${w.baselineCost}`;
    const lower = lowerEffort(state.effort);
    if (lower !== state.effort) {
      return { kind: "reduce-effort", from: state.effort, to: lower, reason: "overthinking", detail };
    }
    // Already at low effort → step the tier down.
    const cheaper = prevTier(state.tier);
    if (cheaper !== state.tier) {
      return { kind: "reduce-tier", from: state.tier, to: cheaper, reason: "overthinking", detail };
    }
    return { kind: "hold", detail: "overthinking but already at floor (low/haiku)" };
  }

  return { kind: "hold", detail: "within thresholds" };
}
