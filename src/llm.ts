import { execFileSync } from "child_process";
import { encode } from "gpt-tokenizer";
import { Tier, Effort, effortForTier } from "./policy";

// Real model calls run through the `claude` CLI in headless mode — on the
// user's Claude Code subscription, NOT a paid API key. When claude is absent or
// ZIPLINE_SIMULATE=1 is set, a deterministic offline stub is used so tests and
// CI stay green with no subscription and no network.

export interface ModelResponse {
  text: string;
  tokens_out: number;
  source: "claude-cli" | "simulate";
}

// Map claude0 tiers to claude CLI --model aliases.
const TIER_MODEL: Record<Tier, string> = {
  haiku: "haiku",
  sonnet: "sonnet",
  opus: "opus",
  fable: "fable",
};

/** Is the real (subscription) path available and not force-disabled? */
export function liveAvailable(): boolean {
  if (process.env.ZIPLINE_SIMULATE === "1") return false;
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Deterministic offline stub. Output length is a stable function of the prompt
 * and tier (no Math.random) so tests are reproducible and the loop still has a
 * real token count to log. Higher tiers "say" a bit more.
 */
function simulate(prompt: string, tier: Tier): ModelResponse {
  const inTokens = encode(prompt).length;
  const factor =
    tier === "fable" ? 4 : tier === "opus" ? 3 : tier === "sonnet" ? 2 : 1;
  // Deterministic pseudo-output derived from the prompt, capped.
  const text = `[simulated ${tier}] ${prompt.slice(0, 40 * factor)}`;
  return { text, tokens_out: encode(text).length, source: "simulate" };
}

/**
 * Call a model at the given tier and reasoning effort. Uses the claude CLI
 * subscription when live, otherwise the deterministic stub. Never throws — a
 * failed live call falls back to simulate so the loop keeps making progress.
 *
 * `effort` maps to `claude --effort <level>`; it defaults to the tier's default
 * (see effortForTier). The CLI degrades honestly on an unknown level (warns and
 * uses its own default), so passing it is always safe.
 */
export function callModel(
  prompt: string,
  tier: Tier,
  effort: Effort = effortForTier(tier)
): ModelResponse {
  if (!liveAvailable()) return simulate(prompt, tier);

  try {
    const raw = execFileSync(
      "claude",
      [
        "-p",
        prompt,
        "--model",
        TIER_MODEL[tier],
        "--effort",
        effort,
        "--output-format",
        "json",
      ],
      { encoding: "utf8", timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
    );
    // claude -p --output-format json returns an envelope with a `result` string
    // and usage. Parse defensively; fall back to raw text on any surprise.
    let text = raw;
    let tokensOut: number | null = null;
    try {
      const env = JSON.parse(raw);
      text = typeof env.result === "string" ? env.result : raw;
      const out = env?.usage?.output_tokens;
      if (typeof out === "number") tokensOut = out;
    } catch {
      // not JSON — treat whole stdout as the text
    }
    return {
      text,
      tokens_out: tokensOut ?? encode(text).length,
      source: "claude-cli",
    };
  } catch {
    // Live path errored (rate limit, network, auth) — degrade to simulate so
    // the loop never hard-fails on a transient model issue.
    return simulate(prompt, tier);
  }
}
