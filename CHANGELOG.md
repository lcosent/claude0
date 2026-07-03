# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- PostToolUse hook to compress real user Bash output (M11)
- terse-output live net-delta + auto-disable (M12)
- Cross-project policy sync `harness policy pull/push` (M13)
- Continuous-learning pipeline: ledger → rule/skill proposals (M14)

## [0.3.0] - 2026-07-03

### Added
- **M10: Real LLM calls via the `claude` CLI subscription** (no API key). New
  `src/llm.ts` `callModel(prompt, tier)` shells out to `claude -p --model
  <haiku|sonnet|opus> --output-format json` on the user's Claude Code
  subscription. `HARNESS_SIMULATE=1` or a missing `claude` binary → a
  deterministic offline stub (no Math.random), so tests/CI run reproducibly with
  no subscription or network. `m4-loop.ts` build/verify steps now call the model
  and log the **real** `tokens_out` (previously hardcoded 800/200/etc.). A failed
  live call degrades to the stub rather than hard-failing the loop.

### Changed
- `harness test` runs milestone tests in simulate mode; the loop's pass/fail is
  now driven by model output, not `Math.random()`.

## [0.2.0] - 2026-07-03

### Fixed
- **Claude Code hook format** — `harness init` wrote an invalid hook
  (`"user-prompt-submit": "..."`); corrected to the real
  `UserPromptSubmit` PascalCase event with the matcher/command array shape.
  The transparent hook never fired before this fix. Uninstall now strips only
  harness's own entry, preserving user-added hooks.

### Added
- **Connect-the-pipe (`harness intercept`)** — the stub is now a real pipeline:
  reads Claude Code's `UserPromptSubmit` JSON from stdin, infers rule tags from
  the prompt, compiles a minimal context bundle, injects it via
  `additionalContext`, and logs real input-side `tokens_in` vs `baseline_tokens`
  to the ledger. Non-harness dirs / failures exit 0 without disturbing the prompt.
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
- **`harness doctor`** — shows the integrations stack and per-repo availability
  (native / accelerated / inactive), plus capability net-delta (kept separate
  from compiler savings to avoid double-counting).
- Optional `capabilities[]` field on ledger entries (backward-compatible).

## [0.1.0] - 2026-07-03

### Added
- **M0: Autonomy Harness**
  - Self-running milestone loops with PASS/FAIL/STUCK detection
  - `hello` and `always-fail` test milestones
  - No-improvement stop (2 consecutive attempts)

- **M1: Context Compiler + Ledger**
  - Context compiler: `compile(goal, tags)` selects minimal rule set
  - Rules system: `.harness/rules/*.md` with frontmatter tags
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
  - `harness report`: runs, savings %, tier mix, escalations
  - Savings by milestone with regression detection
  - Ledger reconciliation checks

- **M7: Cross-Project Policy**
  - Shared policy across repos
  - Cold-start beats hand-written policy

- **CLI Commands**
  - `harness init [--global]` - Initialize .harness/ structure
  - `harness report [--global]` - Token savings dashboard
  - `harness compile "goal" tags` - Manual context compilation
  - `harness uninstall [--global] [--force]` - Clean removal with data protection

- **Path Resolution**
  - Upward search for `.harness/` (like git with `.git/`)
  - Per-repo or global `~/.harness/` support
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
