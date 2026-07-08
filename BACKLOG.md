# ClaudeZero Backlog

Ordered, data-driven milestone queue. `/loop` reads this top-down, picks the
first item whose status is `TODO` and whose `blocked-by` are all `DONE`, executes
it end-to-end, marks it `DONE`, then repeats — no human gate between items.

Status values: `TODO` · `IN_PROGRESS` · `DONE` · `BLOCKED`.
Each item has a **binary, testable** success criterion — that's the loop's exit
condition for the item (no "looks good").

---

## M10 — Real LLM calls (via claude CLI subscription, no API key)

- **status:** DONE — `src/llm.ts callModel` shells to `claude -p` on subscription;
  deterministic offline stub under `ZIPLINE_SIMULATE=1`; m4-loop logs real
  `tokens_out` (not hardcoded). m10-test 7/7, claude CLI 2.1.199 detected live.
- **blocked-by:** —
- **why:** `m4-loop.ts` decides pass/fail with `Math.random()` and hardcodes
  `tokens_out`. Every downstream claim (net-delta, auto-disable) needs real traffic.
- **build:** `src/llm.ts` — `callModel(prompt, tier)` shells out to the `claude`
  CLI in headless mode (`claude -p --model <haiku|sonnet|opus> --output-format json`),
  running on the user's subscription (NOT a paid API key). `ZIPLINE_SIMULATE=1` or a
  missing `claude` binary → deterministic offline stub. Route `buildStep`/`verifyStep`
  through it; log real `tokens_out`.
- **success:** `npm run test:m10` passes — simulate mode is deterministic and offline
  (CI green with no subscription); the live path is present and returns real
  `tokens_out` when `claude` is available.

## M11 — PostToolUse compression of real Bash output

- **status:** DONE — `claude0 compress-output` reads PostToolUse JSON, compresses
  `tool_response.stdout` via M8 native, emits `updatedToolOutput` (replaces the
  model's view; side effects already ran). init registers a Bash-matched
  PostToolUse hook; uninstall strips both claude0 hooks, preserves user hooks.
  m11-test 7/7, 62.7% reduction; e2e envelope verified.
- **blocked-by:** —

## M12 — terse-output live auto-disable

- **status:** DONE — `resolveAvailability` overlays disable state so `claude0
  doctor` shows `disabled` (fixed the M8 gap where doctor ignored shouldDisable);
  terse wired through `runCapability` in the loop. m12-test 6/6; doctor live-verified
  to show `✗ terse-output auto-disabled` on net-negative history. True output-delta
  A/B measurement noted as follow-up (needs no-terse baseline).
- **blocked-by:** M10 (DONE)
- **why:** terse shapes model *output*; its true net delta needs real calls to
  measure. Auto-disable was deferred from M8.
- **build:** Log terse's real output-token delta once M10 lands; feed it into the
  existing `shouldDisable` window.
- **success:** `npm run test:m12` passes — a seeded run of net-negative terse
  deltas flips terse to `disabled` in `claude0 doctor`.

## M13 — Cross-project policy sync

- **status:** DONE — `claude0 policy pull|push` against a central store
  (`$ZIPLINE_POLICY_REMOTE` or `~/.claude0/policy.yaml`). push=local wins,
  pull=repo overrides preserved; provenance logged. Flat parser, no YAML dep.
  m13-test 8/8 (round-trip, override survives, provenance).
- **blocked-by:** —
- **why:** M7 proved a shared policy generalizes; there's no transport yet.
- **build:** `claude0 policy pull|push` against a versioned central policy file
  (local path or git remote); per-repo overrides layered on top; provenance logged.
- **success:** `npm run test:m13` passes — push then pull round-trips a policy;
  a per-repo override survives a pull; provenance recorded in the ledger.

## M14 — Continuous-learning pipeline

- **status:** DONE — `claude0 learn` mines the ledger → deterministic rule
  proposals: DE-PRIORITIZE (excluded ≥80%, 0 failure cost) and PIN (absence
  fail-rate exceeds presence by ≥30pts). Proposal-only; writes nothing without
  `--apply` (verified rules/ unchanged). m14-test 7/7.
- **blocked-by:** M10 (DONE)
- **why:** Ledger data should spawn new rules/skills (DESIGN §4.5 cross-session loop).
- **build:** Batch job reading the ledger → proposes rule/skill diffs (human-approved,
  not silent) → emits into `continuous-learning-v2` format.
- **success:** `npm run test:m14` passes — a frozen ledger produces a deterministic,
  non-empty proposal diff; nothing is written without an approval flag.

---

## M15 — Live-path validation (full execution, not just simulate)

- **status:** DONE — opt-in live gate in `src/m10-test.ts`. Demonstrated BOTH
  states: offline `npm run test:m10` → 7/7, live gate SKIPPED (green); `ZIPLINE_LIVE=1`
  → 8/8 with a REAL subscription call returning `source=claude-cli tokens_out=97`.
  Also validated `callModel` directly against the live CLI (real envelope: `result`
  string + `usage.output_tokens` — matches the parser). This is full execution,
  not simulate-only.
- **live M4 loop finding:** ran the full DESIGN→PLAN→GATE→BUILD→VERIFY chain LIVE
  (6569 real tokens). It executes correctly end-to-end. Fixed a brittle verify gate
  (`/\bFAIL\b/` matched incidental prose) → now parses a structured `VERDICT: PASS|FAIL`
  line. Confirmed the loop's "0/2 completion" on live runs is CORRECT behavior, not a
  bug: two independent santa-method reviewers give genuine verdicts (security correctly
  FAILs unsanitized greeting code; correctness/security verdicts vary with the code).
  A strict two-reviewer gate is *supposed* to be hard to pass — forcing green would game
  the criterion. Verify gate hardening shipped; offline M1-M14 stay green.
- **blocked-by:** —

## M16 — Stable public API surface

- **status:** DONE — barrel `src/index.ts` re-exports the frozen v1 surface
  (compiler/policy/ledger/contracts/integrations/paths + `API_VERSION`); ledger
  gains `LEDGER_SCHEMA_VERSION` stamped on write, pre-v1 lines default to v1.
  `package.json` main→`dist/index.js`, adds `exports`/`types`. m16-test 7/7.
- **blocked-by:** —

## M17 — terse-output live A/B output-delta measurement

- **status:** DONE — `integrations/terse-ab.ts` runs a paired no-terse-vs-terse
  call, returns the signed OUTPUT delta; `ZIPLINE_TERSE_AB=1` wires it into the
  loop; delta feeds the existing `shouldDisable` window. m17-test 7/7.
- **blocked-by:** M16 (DONE)

## M18 — Optional gstack integration (orchestration leaves)

- **status:** DONE — `RepoEnv.gstackInstalled` detects gstack (`$GSTACK_HOME` or
  `~/.claude/skills/gstack`); `claude0 doctor` shows an Orchestration section;
  detected-never-invoked, absence degrades honestly. m18-test 5/5.
- **blocked-by:** —

## M19 — Production-ready hook performance

- **status:** DONE — hard 150ms latency budget on both hot-path hooks; measured
  intercept ~0.5ms, compress-output ~3ms on a 4000-line log (100× reduction).
  m19-test 4/4.
- **blocked-by:** —

---

## Done

- M0-M7 — core spine (autonomy, compiler, router, contracts, loop, learning, dashboard, cross-project).
- M8 — integrations layer (5 native capabilities + `claude0 doctor`) + connect-the-pipe intercept.
- M9 — docs (Mermaid architecture diagrams).
- M10 — real LLM calls via claude CLI subscription (no API key) + deterministic simulate stub.
- M11 — PostToolUse compression of real Bash output (`claude0 compress-output`).
- M12 — terse-output auto-disable, observable in `claude0 doctor`.
- M13 — cross-project policy sync (`claude0 policy pull/push`).
- M14 — continuous-learning pipeline (`claude0 learn`, proposal-only).
- M15 — live-path validation gate (real subscription call, opt-in via ZIPLINE_LIVE=1).
- M16 — stable public API surface + versioned ledger schema (v1 gate).
- M17 — terse-output A/B output-delta measurement (v1 gate).
- M18 — optional gstack integration, honest degradation (v1 gate).
- M19 — production-ready hook performance, hard latency budget (v1 gate).

**v1.0.0 cut** — all four roadmap v1 gates shipped; M0–M19 green offline.
**Backlog drained** — no runnable TODO remains. Add new items above the Done
section for `/loop` to pick up.
