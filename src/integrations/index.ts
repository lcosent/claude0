import { readLedger } from "../ledger";
import { Capability, CapabilityResult, RepoEnv } from "./types";
import { detectRepoEnv } from "./detect";
import { CAPABILITIES } from "./registry";

export * from "./types";
export { detectRepoEnv, clearDetectCache } from "./detect";
export { CAPABILITIES, getCapability, selectCapabilities } from "./registry";
export { compressNative, compressCapability } from "./compress";
export { querySymbol, symbolCapability, clearSymbolCache } from "./symbols";
export { fetchPackageDoc, docsCapability } from "./docs";
export { terseCapability, TERSE_FRAGMENT } from "./terse";
export { measureTerseOutputDelta, terseABToLogEntry } from "./terse-ab";
export type { TerseABResult, ModelCall } from "./terse-ab";
export { decisionLogCapability } from "./decision-log";

// Net-negative auto-disable threshold. Reuses the SHAPE of M2 auto-demote
// (>threshold over last N runs flips a default) — DISTINCT mechanism: M2 flips
// model tiers on fail-rate; this flips a capability off on token-accounting.
const DISABLE_WINDOW = 10;
const DISABLE_FRACTION = 0.4; // >40% net-negative over last N runs → disable

export interface CapabilityLogEntry {
  name: string;
  tokens_before: number;
  tokens_after: number;
  source: "native" | "adapter";
  net_delta_exempt: boolean;
}

/** Input-side net delta. Positive = tokens saved. Exempt capabilities → null. */
export function netDelta(r: CapabilityResult): number | null {
  if (r.netDeltaExempt) return null;
  if (r.tokensBefore <= 0) return 0;
  return (r.tokensBefore - r.tokensAfter) / r.tokensBefore;
}

/**
 * Should this capability be auto-disabled? True when, over the last
 * DISABLE_WINDOW ledger entries that recorded it (non-exempt), more than
 * DISABLE_FRACTION went net-negative (cost more than they saved).
 */
export function shouldDisable(name: string, repoRoot: string): boolean {
  const runs: CapabilityLogEntry[] = [];
  for (const entry of readLedger(repoRoot)) {
    for (const c of entry.capabilities ?? []) {
      if (c.name === name && !c.net_delta_exempt) {
        runs.push(c as CapabilityLogEntry);
      }
    }
  }
  const recent = runs.slice(-DISABLE_WINDOW);
  if (recent.length < DISABLE_WINDOW) return false; // not enough data yet
  const negative = recent.filter(
    (c) => c.tokens_before > 0 && c.tokens_after > c.tokens_before
  ).length;
  return negative / recent.length > DISABLE_FRACTION;
}

/**
 * Resolve a capability's effective availability for THIS repo, overlaying
 * auto-disable on top of its own availability(). This is the single source of
 * truth both `claude0 doctor` and runCapability use — so a net-negative
 * capability shows "disabled" everywhere, not just in the run path.
 */
export function resolveAvailability(cap: Capability, repoRoot: string, env: RepoEnv) {
  const base = cap.availability(env);
  // A capability that isn't even active here can't be "disabled" — report as-is.
  if (base.status !== "native" && base.status !== "accelerated") return base;
  if (shouldDisable(cap.name, repoRoot)) {
    return {
      status: "disabled" as const,
      detail: "auto-disabled (net-negative token delta over recent runs)",
      advisory: base.advisory,
    };
  }
  return base;
}

/**
 * Run a capability by name against `input`, returning its result. Respects
 * auto-disable (returns a passthrough result when disabled). The caller folds
 * the returned CapabilityResult into the ledger entry's `capabilities` array.
 */
export function runCapability(
  name: string,
  input: string,
  repoRoot: string,
  env: RepoEnv = detectRepoEnv(repoRoot)
): CapabilityResult {
  const cap: Capability | undefined = CAPABILITIES.find((c) => c.name === name);
  if (!cap) {
    return { name, output: input, tokensBefore: 0, tokensAfter: 0, source: "native" };
  }

  const availability = cap.availability(env);
  const inactive = availability.status === "inactive";
  const disabled = shouldDisable(name, repoRoot);

  if (inactive || disabled) {
    // Passthrough: capability doesn't apply here — don't alter the input.
    return {
      name,
      output: input,
      tokensBefore: 0,
      tokensAfter: 0,
      source: "native",
      netDeltaExempt: true,
    };
  }

  return cap.run(input, env);
}

/** Convert a CapabilityResult into the ledger's capability sub-entry shape. */
export function toLogEntry(r: CapabilityResult): CapabilityLogEntry {
  return {
    name: r.name,
    tokens_before: r.tokensBefore,
    tokens_after: r.tokensAfter,
    source: r.source,
    net_delta_exempt: !!r.netDeltaExempt,
  };
}
