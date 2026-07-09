import { Tier } from "../policy";
import { callModel, ModelResponse } from "../llm";
import { TERSE_FRAGMENT } from "./terse";
import { CapabilityLogEntry } from "./index";

// terse-output A/B measurement. terse shapes model OUTPUT, so its true net
// delta can't be read from the input side (prepending a fragment always makes
// the INPUT bigger). The only honest measurement is a paired run: the same
// base prompt WITHOUT the fragment vs WITH it, comparing tokens_out. Positive
// delta = terse produced shorter output (the intended payoff); negative = it
// cost more than it saved, which is exactly the signal shouldDisable() acts on.
//
// The model call is injectable so tests are deterministic and offline; the
// live path uses the real `claude` CLI via callModel.

export type ModelCall = (prompt: string, tier: Tier) => ModelResponse;

export interface TerseABResult {
  /** Model output tokens for the base prompt with NO terse fragment. */
  tokensWithout: number;
  /** Model output tokens for the base prompt WITH the terse fragment. */
  tokensWith: number;
  /**
   * Signed output-side delta as a fraction of the no-terse baseline.
   * Positive = terse saved output tokens; negative = terse cost more.
   * 0 when the baseline produced no output (nothing to compare against).
   */
  delta: number;
}

/**
 * Run one A/B pair for `baseObjective` at `tier`. Returns the measured
 * output-token counts and a signed delta. `call` defaults to the real model
 * call; pass a deterministic stub in tests.
 */
export function measureTerseOutputDelta(
  baseObjective: string,
  tier: Tier,
  call: ModelCall = callModel
): TerseABResult {
  const withoutResp = call(baseObjective, tier);
  const withPrompt = baseObjective
    ? `${TERSE_FRAGMENT}\n\n${baseObjective}`
    : TERSE_FRAGMENT;
  const withResp = call(withPrompt, tier);

  const tokensWithout = withoutResp.tokens_out;
  const tokensWith = withResp.tokens_out;
  const delta = tokensWithout > 0 ? (tokensWithout - tokensWith) / tokensWithout : 0;
  return { tokensWithout, tokensWith, delta };
}

/**
 * Convert an A/B result into the ledger capability sub-entry, encoding the
 * OUTPUT-side effect (not the input fragment cost). tokens_before is the
 * no-terse output; tokens_after is the terse output — so shouldDisable's
 * `tokens_after > tokens_before` test fires precisely when terse lengthened
 * output. This replaces the neutral placeholder the loop logged before M17.
 */
export function terseABToLogEntry(ab: TerseABResult): CapabilityLogEntry {
  return {
    name: "terse-output",
    tokens_before: ab.tokensWithout,
    tokens_after: ab.tokensWith,
    source: "native",
    net_delta_exempt: false,
  };
}
