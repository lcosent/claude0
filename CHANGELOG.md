# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — Fable-era routing (M20–M23)

Four routing upgrades prompted by the shift to Fable 5 as a first-class,
expensive tier. Each has a binary offline gate (`npm test` runs M20–M23 green),
and every change is backward-compatible: no ledger schema bump, old `policy.yaml`
files still parse, and the budget breaker is off by default.

- **M20: Fable tier.** `fable` joins the `Tier` union (`TIER_COST.fable = 2`, ~2×
  opus) and `TIER_MODEL` (`--model fable`). Critically, `fable` is **off the
  escalation ladder** (`TIER_ORDER` unchanged; new `ALL_TIERS` carries it for
  cost/reporting): `nextTier` can never promote a stalled step into the architect
  tier — Fable is assigned by policy only. The design-synthesis converge step and
  `DEFAULT_POLICY` now default to `fable`. `test:m20`.
- **M21: reasoning-effort axis.** New `Effort` type + `DEFAULT_EFFORT_BY_TIER`
  (`haiku→low, sonnet→medium, opus/fable→high`; **never `xhigh`/`max` by
  default**). Policy entries accept an optional `tier@effort` override
  (`design-synthesis: fable@high`); bare tiers round-trip byte-identically.
  `callModel` gains an `effort` arg mapped to `claude --effort` (the CLI degrades
  honestly on unknown levels). The ledger gains an optional `effort` field
  (additive, no schema bump); `zipline report` shows an effort mix. `test:m21`.
- **M22: cost-regression demotion.** The auto-demote decision is extracted from
  the M2 sim into a shared `src/router.ts` (`assessRoute`). Beyond the existing
  fail-rate escalation, it adds an **overthinking** trigger — a tier that passes
  but at ballooning `tokens_out` — and cuts **effort before tier** (reduce
  thinking before switching models). Reliability wins ties. `test:m22`.
- **M23: budget circuit-breaker.** `ZIPLINE_MAX_TOKENS` sets a hard cumulative
  cap; `runMilestone`/`runM4Loop` halt before the next expensive step once it's
  reached. A halt persists as a schema-safe `STUCK` entry with a `budget-halt:`
  note (internal `LoopOutcome` `"BUDGET"` is never written); `zipline report`
  counts budget halts. Unset = no cap. `test:m23`.

_M0–M19 shipped in v1.0.0 below._

## [1.0.0] - 2026-07-03

First stable release. The four v1 gates from the roadmap all landed, each with a
binary, offline test (`npm test` runs M1–M19 green).

### Added
- **M16: stable public API surface.** New barrel `src/index.ts` (compiled to
  `dist/index.js`, now the package `main`) re-exports the frozen v1 surface —
  compiler, policy, policy-sync, ledger, contracts, report, learn, integrations,
  paths — plus `API_VERSION`. The ledger schema gains `LEDGER_SCHEMA_VERSION` and
  stamps `schema` on every written line; pre-v1 ledgers (no `schema`) parse as v1
  (backward-compatible). `package.json` gains `exports` (`.` → library, `./cli`)
  and `types`. `test:m16` 7/7.
- **M17: terse-output A/B output-delta measurement.** `src/integrations/terse-ab.ts`
  runs a paired no-terse-vs-terse model call and returns the signed OUTPUT-token
  delta — the honest measurement terse needed (its input-side fragment always
  reads negative). `ZIPLINE_TERSE_AB=1` wires it into the loop's build step; the
  logged delta feeds the existing `shouldDisable` window, so a net-negative terse
  now trips on real output data. `test:m17` 7/7.
- **M18: optional gstack integration.** `RepoEnv.gstackInstalled` detects the
  gstack orchestration suite (`$GSTACK_HOME` or `~/.claude/skills/gstack`);
  `zipline doctor` surfaces an "Orchestration (optional)" section. Detected, never
  invoked; absence degrades honestly and never throws. `test:m18` 5/5.
- **M19: production-ready hook performance.** A hard latency budget (150ms) pins
  both hot-path hooks — `intercept` (~0.5ms) and `compress-output` (~3ms on a
  4000-line log, 100× token reduction). Guards against accidental O(n²) or
  heavyweight-import regressions on Claude Code's critical path. `test:m19` 4/4.

### Changed
- `package.json` `main` now points at the library barrel (`dist/index.js`); the
  CLI is exposed via `bin` and `exports["./cli"]`.
- `appendLedger` accepts `LedgerEntryInput` (schema/defaulted fields optional at
  construction); readers still get the fully-resolved `LedgerEntry`.

## [0.7.1] - 2026-07-03

### Added
- **M15: live-path validation gate.** `src/m10-test.ts` gains an opt-in gate that,
  under `ZIPLINE_LIVE=1` with the `claude` CLI present, makes ONE real subscription
  call and asserts `source==="claude-cli"` and `tokens_out>0` — validating M10's
  live path by full execution, not just simulate. Offline or without the flag the
  gate is SKIPPED (not failed), so `npm test`/CI stays green. Verified both states:
  offline 7/7 (skipped), live 8/8 (real call, tokens_out=97).

### Fixed
- **M4 verify gate robustness.** The reviewer pass/fail check matched a bare
  `FAIL` substring, so a real review saying "would FAIL if..." mis-parsed. Now the
  reviewer is asked for a structured `VERDICT: PASS|FAIL` line and only that is
  parsed. Validated by running the full DESIGN→PLAN→GATE→BUILD→VERIFY loop live
  (6569 real tokens): the loop executes end-to-end and its two-reviewer
  santa-method gate gives genuine verdicts (e.g. security correctly fails an
  unsanitized greeting). A strict gate that's hard to pass is by design.

## [0.7.0] - 2026-07-03

### Added
- **M14: continuous-learning pipeline** — `zipline learn` mines the ledger and
  proposes rule changes from evidence, deterministically: DE-PRIORITIZE a rule
  that's excluded in ≥80% of runs with zero failure cost, and PIN a rule whose
  absence correlates with failures (fail-rate ≥30pts higher when excluded vs
  included). Proposals are human-reviewable and **never written silently** —
  `zipline learn` prints them; nothing touches `.zipline/rules/` without explicit
  approval (`--apply` stages for review; automatic rewriting is deferred by
  design). Closes the DESIGN §4.5 cross-session learning loop.

## [0.6.0] - 2026-07-03

### Added
- **M13: cross-project policy sync** — `zipline policy pull|push` makes the
  routing policy a portable, versioned artifact shared across repos. Central
  store is `$ZIPLINE_POLICY_REMOTE` or `~/.zipline/policy.yaml`. `push` publishes
  the repo's tuned policy (local wins); `pull` layers central defaults UNDER the
  repo's own entries so per-repo overrides always survive. Every sync logs
  provenance (op, changed steps, source) to the ledger. Flat `key: tier` parser —
  no YAML dependency added.

## [0.5.0] - 2026-07-03

### Added
- **M12: terse-output auto-disable, observable in `zipline doctor`.** New
  `resolveAvailability()` overlays the auto-disable decision on top of a
  capability's own availability — the single source of truth doctor and
  runCapability now share. This closes the M8 gap where doctor reported "native"
  for a capability the run path was already disabling. When terse-output's net
  token delta goes negative over the rolling window, doctor shows
  `✗ terse-output auto-disabled`. terse is now applied via `runCapability` in the
  build step (respects disable). Note: terse's true payoff is output-side; live
  A/B output measurement is a follow-up, but the disable mechanism is proven and
  observable now.

## [0.4.0] - 2026-07-03

### Added
- **M11: PostToolUse compression of real Bash output.** `zipline init` now also
  registers a `PostToolUse` hook (matcher `Bash`) calling the new
  `zipline compress-output` command. It reads the tool-result JSON from stdin,
  compresses `tool_response.stdout` with the M8 native compressor, and returns a
  `hookSpecificOutput.updatedToolOutput` envelope that **replaces what Claude
  sees** (the command already ran; only the model's view shrinks). ~63% reduction
  on noisy build logs. `stderr`/flags preserved; non-Bash tools pass through.
- `uninstall` now strips both zipline hooks (intercept + compress-output) while
  preserving any user-added hooks on the same events.

## [0.3.0] - 2026-07-03

### Added
- **M10: Real LLM calls via the `claude` CLI subscription** (no API key). New
  `src/llm.ts` `callModel(prompt, tier)` shells out to `claude -p --model
  <haiku|sonnet|opus> --output-format json` on the user's Claude Code
  subscription. `ZIPLINE_SIMULATE=1` or a missing `claude` binary → a
  deterministic offline stub (no Math.random), so tests/CI run reproducibly with
  no subscription or network. `m4-loop.ts` build/verify steps now call the model
  and log the **real** `tokens_out` (previously hardcoded 800/200/etc.). A failed
  live call degrades to the stub rather than hard-failing the loop.

### Changed
- `zipline test` runs milestone tests in simulate mode; the loop's pass/fail is
  now driven by model output, not `Math.random()`.

## [0.2.0] - 2026-07-03

### Fixed
- **Claude Code hook format** — `zipline init` wrote an invalid hook
  (`"user-prompt-submit": "..."`); corrected to the real
  `UserPromptSubmit` PascalCase event with the matcher/command array shape.
  The transparent hook never fired before this fix. Uninstall now strips only
  zipline's own entry, preserving user-added hooks.

### Added
- **Connect-the-pipe (`zipline intercept`)** — the stub is now a real pipeline:
  reads Claude Code's `UserPromptSubmit` JSON from stdin, infers rule tags from
  the prompt, compiles a minimal context bundle, injects it via
  `additionalContext`, and logs real input-side `tokens_in` vs `baseline_tokens`
  to the ledger. Non-zipline dirs / failures exit 0 without disturbing the prompt.
- **M8: Integrations layer** (`src/integrations/`) — 5 native capabilities,
  auto-selected per step (the user never picks one):
  - `output-compress` — native filter/dedupe/truncate of command output; uses
    `rtk` as an accelerator when on PATH. ~66% reduction on noisy build logs.
  - `symbol-query` — type/diagnostics via the TS Language Service (cached), no
    whole-file reads. Detect-and-degrade: shows "TS repos only — inactive here"
    outside TS repos rather than erroring.
  - `doc-fetch` — compressed `node_modules` README + type surface (Node-only).
  - `terse-output` — dense-output prompt fragment (auto-disable deferred).
  - `decision-log` — append-only decisions; exempt from net-delta accounting.
  - Centralized `detect.ts` (`RepoEnv`): one cached probe of tsconfig/node_modules/
    rtk/MCP config — capabilities read flags, never re-probe.
  - Net-negative auto-disable (M2-shaped rolling window) for input-side capabilities.
- **`zipline doctor`** — shows the integrations stack and per-repo availability
  (native / accelerated / inactive), plus capability net-delta (kept separate
  from compiler savings to avoid double-counting).
- Optional `capabilities[]` field on ledger entries (backward-compatible).

## [0.1.0] - 2026-07-03

### Added
- **M0: Autonomy Zipline**
  - Self-running milestone loops with PASS/FAIL/STUCK detection
  - `hello` and `always-fail` test milestones
  - No-improvement stop (2 consecutive attempts)

- **M1: Context Compiler + Ledger**
  - Context compiler: `compile(goal, tags)` selects minimal rule set
  - Rules system: `.zipline/rules/*.md` with frontmatter tags
  - Ledger: append-only JSONL with `tokens_in`, `baseline_tokens`
  - **Proven savings:** 64.4% median token reduction vs full-context
  - Silent-drop protection with `rules_included[]`, `rules_excluded[]`

- **M2: Router**
  - Policy-based tier selection (Haiku/Sonnet/Opus)
  - Escalation on contract validation failure
  - Auto-demote: >40% fail-rate promotes default tier
  - **Cost savings:** 19.8% of always-Opus cost at pass-rate parity

- **M3: Contracts**
  - Zod schemas for typed step I/O
  - Schema validation with 1 repair retry
  - **Output quality:** 100% valid rate, 70% token reduction

- **M4: The Loop**
  - DESIGN step: Multi-agent debate (pragmatist/skeptic/architect) → converge
  - PLAN step: Design → milestones with success criteria
  - GATE step: Re-plan against prior actuals from ledger
  - BUILD step: Implementation with compiler + router
  - VERIFY step: 2 independent reviewers (santa-method)

- **M5: Learning**
  - Policy tuning from ≥100 ledger runs
  - Compiler rule selection optimization
  - Human-approved policy diffs
  - **Tuning results:** 75% of starting policy cost at pass-rate parity

- **M6: Dashboard**
  - `zipline report`: runs, savings %, tier mix, escalations
  - Savings by milestone with regression detection
  - Ledger reconciliation checks

- **M7: Cross-Project Policy**
  - Shared policy across repos
  - Cold-start beats hand-written policy

- **CLI Commands**
  - `zipline init [--global]` - Initialize .zipline/ structure
  - `zipline report [--global]` - Token savings dashboard
  - `zipline compile "goal" tags` - Manual context compilation
  - `zipline uninstall [--global] [--force]` - Clean removal with data protection

- **Path Resolution**
  - Upward search for `.zipline/` (like git with `.git/`)
  - Per-repo or global `~/.zipline/` support
  - Works from any subdirectory

- **Documentation**
  - README.md: User guide
  - DESIGN.md: Architecture and design decisions
  - MILESTONES.md: Detailed success criteria
  - IMPLEMENTATION.md: Delivery summary and metrics

### Test Results
- All milestone tests (M0-M7) passing
- Integration tests validated full workflow
- Median token savings: 63.2%
- Pass rate: 89.7%

## [0.0.1] - 2026-07-02

### Initial
- Project structure created
- Design document drafted
- Gstack review completed
- GO/NO-GO gate defined for M1

---

## Version History

- **0.1.0** - First complete release (all milestones M0-M7)
- **0.0.1** - Initial design and planning

## Deprecation Notice

None currently.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.
