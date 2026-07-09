// Public API barrel — the STABLE surface claude0 promises for v1.0.0.
//
// Anything re-exported here is covered by semver: it won't be removed or have
// its type narrowed within the 1.x line without a major bump. Internals not
// listed here (CLI wiring, test scaffolds, per-capability implementations) are
// free to change. If you import from a deep path instead of this barrel, you
// are opting out of that stability guarantee.
//
// package.json `main` points at the compiled dist/index.js, so
// `import { ... } from "claude0"` resolves here.

// ── Compiler: rule loading + context bundling ────────────────────────────
export type { Rule, Bundle } from "./compiler";
export { loadRules, compile, fullContextBundle, tokenCount } from "./compiler";

// ── Policy: model-tier routing ───────────────────────────────────────────
export type { Tier, Effort, PolicyEntry, Policy } from "./policy";
export {
  TIER_ORDER,
  ALL_TIERS,
  TIER_COST,
  nextTier,
  prevTier,
  EFFORT_ORDER,
  lowerEffort,
  DEFAULT_EFFORT_BY_TIER,
  effortForTier,
  entryTier,
  entryEffort,
  sameEntry,
} from "./policy";

// ── Router: shared routing decision (reliability + cost-regression) ───────
export type { RouteState, WindowStats, RouteAction } from "./router";
export {
  assessRoute,
  DEMOTE_WINDOW,
  DEMOTE_FAILRATE,
  HEALTHY_FAILRATE,
  OVERTHINK_RATIO,
} from "./router";

// ── Policy sync: portable cross-project policy artifact ───────────────────
export type { PolicyMap, SyncResult } from "./policy-sync";
export {
  parsePolicy,
  serializePolicy,
  centralPolicyPath,
  pushPolicy,
  pullPolicy,
} from "./policy-sync";

// ── Ledger: the append-only accounting record ────────────────────────────
export type { LedgerEntryInput } from "./ledger";
export { LedgerEntry, LEDGER_SCHEMA_VERSION, appendLedger, readLedger, ledgerTail } from "./ledger";

// ── Contracts: step-output validation ────────────────────────────────────
export type { StepOutput, ValidationResult } from "./contract";
export { StepOutputSchema, validateWithRepair } from "./contract";

// ── Reporting + learning ─────────────────────────────────────────────────
export type { ReportTotals } from "./report";
export { buildReport, detectRegression, reconciles } from "./report";
export type { Proposal, ProposalKind } from "./learn";
export { proposeChanges, computeStats, renderProposals } from "./learn";

// ── Integrations: native-first capability layer ──────────────────────────
export type {
  Capability,
  CapabilityResult,
  CapabilityAvailability,
  CapabilityStatus,
  RepoEnv,
} from "./integrations";
export {
  CAPABILITIES,
  getCapability,
  selectCapabilities,
  detectRepoEnv,
  runCapability,
  resolveAvailability,
  shouldDisable,
  netDelta,
  measureTerseOutputDelta,
  terseABToLogEntry,
} from "./integrations";
export type { TerseABResult } from "./integrations";

// ── Budget: the autonomous-loop spend circuit-breaker ─────────────────────
export {
  budgetLimitTokens,
  budgetHaltNote,
  isBudgetHalt,
  BUDGET_HALT_PREFIX,
} from "./budget";

// ── Paths: claude0-root discovery ────────────────────────────────────────
export { findClaudeZeroRoot, requireClaudeZeroRoot } from "./paths";

/**
 * The public API version. Tracks the package major/minor; bump in lockstep
 * with package.json. Distinct from LEDGER_SCHEMA_VERSION, which versions only
 * the on-disk ledger record.
 */
export const API_VERSION = "1.1.0";
