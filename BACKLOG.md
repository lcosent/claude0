# Harness Backlog

Ordered, data-driven milestone queue. `/loop` reads this top-down, picks the
first item whose status is `TODO` and whose `blocked-by` are all `DONE`, executes
it end-to-end, marks it `DONE`, then repeats — no human gate between items.

Status values: `TODO` · `IN_PROGRESS` · `DONE` · `BLOCKED`.
Each item has a **binary, testable** success criterion — that's the loop's exit
condition for the item (no "looks good").

---

## M10 — Real LLM calls (replace the simulated loop)

- **status:** TODO
- **blocked-by:** —
- **why:** `m4-loop.ts` decides pass/fail with `Math.random()` and hardcodes
  `tokens_out`. Every downstream claim (net-delta, auto-disable) needs real traffic.
- **build:** Add an Anthropic client (env `ANTHROPIC_API_KEY`); route `buildStep`/
  `verifyStep` through it via the ROUTER tier; keep a `--simulate` flag so tests run
  offline. Record real `tokens_out` in the ledger.
- **success:** `npm run test:m10` passes — a live call path exists and, when
  `HARNESS_SIMULATE=1`, the suite runs deterministically offline (CI stays green
  with no key). Real `tokens_out` logged (not hardcoded) when a key is present.

## M11 — PostToolUse compression of real Bash output

- **status:** TODO
- **blocked-by:** —
- **why:** M8 `output-compress` only touches the internal loop. Real user Bash
  output arrives via a PostToolUse hook harness doesn't register.
- **build:** `harness init` also registers a `PostToolUse` hook (matcher `Bash`)
  calling `harness compress-output`; implement that command to read tool output
  from stdin and return the compressed form.
- **success:** `npm run test:m11` passes — a PostToolUse payload piped to
  `harness compress-output` returns ≥40% smaller output on a noisy fixture; init
  writes a valid PostToolUse hook; uninstall removes it.

## M12 — terse-output live auto-disable

- **status:** TODO
- **blocked-by:** M10
- **why:** terse shapes model *output*; its true net delta needs real calls to
  measure. Auto-disable was deferred from M8.
- **build:** Log terse's real output-token delta once M10 lands; feed it into the
  existing `shouldDisable` window.
- **success:** `npm run test:m12` passes — a seeded run of net-negative terse
  deltas flips terse to `disabled` in `harness doctor`.

## M13 — Cross-project policy sync

- **status:** TODO
- **blocked-by:** —
- **why:** M7 proved a shared policy generalizes; there's no transport yet.
- **build:** `harness policy pull|push` against a versioned central policy file
  (local path or git remote); per-repo overrides layered on top; provenance logged.
- **success:** `npm run test:m13` passes — push then pull round-trips a policy;
  a per-repo override survives a pull; provenance recorded in the ledger.

## M14 — Continuous-learning pipeline

- **status:** TODO
- **blocked-by:** M10
- **why:** Ledger data should spawn new rules/skills (DESIGN §4.5 cross-session loop).
- **build:** Batch job reading the ledger → proposes rule/skill diffs (human-approved,
  not silent) → emits into `continuous-learning-v2` format.
- **success:** `npm run test:m14` passes — a frozen ledger produces a deterministic,
  non-empty proposal diff; nothing is written without an approval flag.

---

## Done

- M0-M7 — core spine (autonomy, compiler, router, contracts, loop, learning, dashboard, cross-project).
- M8 — integrations layer (5 native capabilities + `harness doctor`) + connect-the-pipe intercept.
- M9 — docs (Mermaid architecture diagrams).
