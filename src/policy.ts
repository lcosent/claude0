export type Tier = "haiku" | "sonnet" | "opus" | "fable";

// The ESCALATION LADDER: a failing step climbs this, capped at opus. `fable` is
// deliberately NOT on it — Fable is the architect tier, assigned by policy to
// planning/review, never reached by a mechanical step that stalled ("architect,
// not roommate"). `nextTier` can never return "fable".
export const TIER_ORDER: Tier[] = ["haiku", "sonnet", "opus"];

// Cost/report ordering — includes fable. Distinct from TIER_ORDER so fable
// participates in cost accounting and reports without ever entering escalation.
export const ALL_TIERS: Tier[] = ["haiku", "sonnet", "opus", "fable"];

// Relative cost per token unit, Opus = 1x baseline for comparison purposes.
// Fable is ~2x Opus, so a step must be worth it to route there.
export const TIER_COST: Record<Tier, number> = {
  haiku: 0.05,
  sonnet: 0.2,
  opus: 1,
  fable: 2,
};

// Reasoning effort — the second cost axis, orthogonal to tier. Maps to the
// `claude --effort <level>` flag. "xhigh"/"max" are valid but NEVER chosen by a
// default: they're token furnaces that often produce worse output, so they're
// opt-in only (a policy must name them explicitly).
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const DEFAULT_EFFORT_BY_TIER: Record<Tier, Effort> = {
  haiku: "low", // mechanical work — don't pay to think
  sonnet: "medium", // the sweet spot for standard execution
  opus: "high", // deep reasoning earns high
  fable: "high", // architect tier caps at high, never xhigh by default
};

/** The default effort for a tier when a policy entry doesn't name one. */
export function effortForTier(t: Tier): Effort {
  return DEFAULT_EFFORT_BY_TIER[t];
}

// A policy entry is either a bare tier (effort defaults per tier) or a tier with
// an explicit effort override.
export type PolicyEntry = Tier | { tier: Tier; effort: Effort };

export function entryTier(e: PolicyEntry): Tier {
  return typeof e === "string" ? e : e.tier;
}

export function entryEffort(e: PolicyEntry): Effort {
  return typeof e === "string" ? effortForTier(e) : e.effort;
}

export function sameEntry(a: PolicyEntry, b: PolicyEntry | undefined): boolean {
  if (b === undefined) return false;
  return entryTier(a) === entryTier(b) && entryEffort(a) === entryEffort(b);
}

export interface Policy {
  [step: string]: Tier;
}

export function nextTier(t: Tier): Tier {
  // Escalate along TIER_ORDER only. If `t` is off-ladder (fable), indexOf is -1
  // and we cap at opus — escalation never promotes into or past the architect tier.
  const i = TIER_ORDER.indexOf(t);
  if (i === -1) return "opus";
  return TIER_ORDER[Math.min(i + 1, TIER_ORDER.length - 1)];
}

/**
 * One tier cheaper — the cost-cutting direction. `fable` steps down to `opus`
 * (its nearest ladder tier); the ladder floor is `haiku`.
 */
export function prevTier(t: Tier): Tier {
  if (t === "fable") return "opus";
  const i = TIER_ORDER.indexOf(t);
  if (i <= 0) return "haiku";
  return TIER_ORDER[i - 1];
}

// Effort ladder, cheapest → most expensive. Used to step effort down before
// touching the tier (reduce thinking before switching models).
export const EFFORT_ORDER: Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** One effort notch lower; floor is "low". */
export function lowerEffort(e: Effort): Effort {
  const i = EFFORT_ORDER.indexOf(e);
  return EFFORT_ORDER[Math.max(i - 1, 0)];
}
