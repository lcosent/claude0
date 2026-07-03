export type Tier = "haiku" | "sonnet" | "opus";

export const TIER_ORDER: Tier[] = ["haiku", "sonnet", "opus"];

// Relative cost per token unit, Opus = 1x baseline for comparison purposes.
export const TIER_COST: Record<Tier, number> = {
  haiku: 0.05,
  sonnet: 0.2,
  opus: 1,
};

export interface Policy {
  [step: string]: Tier;
}

export function nextTier(t: Tier): Tier {
  const i = TIER_ORDER.indexOf(t);
  return TIER_ORDER[Math.min(i + 1, TIER_ORDER.length - 1)];
}
