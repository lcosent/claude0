# zipline — Milestones

**Mode:** EXPANSION · **Companion to:** DESIGN.md
**Purpose:** Each milestone is a self-contained **goal** with a falsifiable
**hypothesis**, an executable **test**, and a binary **success criterion** that
doubles as the loop's exit condition. An agent can run these autonomously.

---

## Autonomy contract (how an agent runs this file)

Each milestone is a loop with a goal and a gate. The agent executes this state
machine per milestone, no human in the inner loop:

```
LOAD    read milestone: goal, hypothesis, build, test, success, gate
BUILD   implement the smallest change that could satisfy success
TEST    run the test command → capture metrics into .zipline/ledger.jsonl
CHECK   metrics vs success criterion:
          PASS  → run GATE; if gate passes, advance to next milestone
          FAIL  → diagnose, amend, re-BUILD  (max N attempts)
          STUCK → after N attempts with no metric improvement, STOP + escalate
```

Rules that make the loop safe and terminating:
- **Success criteria are numeric and binary.** No "looks good." The agent reads
  a number from the ledger and compares. This is the only thing that ends a loop.
- **Every loop has a budget.** `max_attempts` per milestone (default 5) and a
  no-improvement stop (2 consecutive attempts with the same failing metric → STOP).
- **Gates are one-way doors.** A gate failure halts the whole run and escalates to
  the human. Milestones never skip a failed gate.
- **Re-plan against actuals.** Before BUILD, the agent reads the prior milestone's
  ledger entries and adjusts THIS milestone's plan if actuals contradict the
  original assumptions (DESIGN.md §4.4 GATE).
- **Everything is logged.** Each attempt appends to the ledger so STUCK detection
  and cross-session learning have data.

Milestone status values: `PENDING → IN_PROGRESS → PASSED / BLOCKED`.

---

## M0 — Skeleton + autonomy zipline

- **Goal:** A runnable spine that can execute one trivial milestone end-to-end
  through the LOAD→TEST→CHECK loop, so the machinery itself is proven before real
  work rides on it.
- **Hypothesis:** The loop state machine can drive a step, capture a metric to the
  ledger, and make a PASS/FAIL/STUCK decision with zero human input.
- **Build:**
  - `.zipline/` convention: `config.yaml`, `ledger.jsonl`, `rules/`, `milestones/`.
  - `zipline run <milestone-id>` — executes the LOAD→BUILD→TEST→CHECK loop.
  - Ledger writer (append-only JSONL) with the DESIGN.md §4.5 schema.
  - A no-op "hello" milestone whose success is "ledger has 1 entry with pass=true."
- **Test:** `zipline run hello` then assert the ledger tail parses and `pass==true`.
- **Success criterion:** exit code 0; ledger gains exactly one well-formed entry;
  the loop terminated on its own (no timeout, no manual stop).
- **Gate → M1:** the loop can also detect FAIL and STUCK — verified by a seeded
  always-fail milestone that STOPs after `max_attempts` without hanging.

## M1 — Context Compiler + Ledger (the make-or-break)

- **Goal:** Given `(goal, step, repo state)`, emit the minimal context bundle a step
  needs, and prove it costs far fewer tokens than naive full-context.
- **Hypothesis:** A compiled bundle (objective + matched rules + touched files +
  relevant ledger memory) preserves task correctness while cutting input tokens
  ≥30% median vs dumping full CLAUDE.md + all candidate files.
- **Build:**
  - Split a real CLAUDE.md into `rules/*.md`, one concern each, front-matter tagged.
  - `zipline compile <step>` → bundle with `objective, constraints, artifacts,
    memory, budget`; over budget → summarize, never truncate.
  - Ledger logs `tokens_in`, `baseline_tokens`, `rules_included[]`,
    `rules_excluded[]` per compile.
- **Test:** On a fixed set of ≥10 real steps from an existing repo, run each step
  twice — once with the compiled bundle, once with naive full context — and record
  both token counts and whether the step's output passed its own check.
- **Success criterion (dual, both required):**
  1. **Savings:** median `(baseline_tokens - tokens_in)/baseline_tokens ≥ 0.30`.
  2. **No correctness regression:** compiled-context pass-rate ≥ full-context
     pass-rate across the 10 steps.
- **Gate → M2 (GO/NO-GO, one-way):** if either criterion fails, STOP the whole
  project and rethink the premise. The spine is not worth building if the compiler
  doesn't save tokens without breaking correctness.

## M2 — Router (Anthropic tiers + escalation + auto-demote)

- **Goal:** Pick the cheapest Anthropic tier that can pass each step's contract,
  escalating only on failure, and self-correct the policy from ledger data.
- **Hypothesis:** Most steps pass at Haiku/Sonnet; escalation-on-fail plus
  auto-demote yields lower total token-cost than always-Opus at equal pass-rate.
- **Build:**
  - `policy.yaml` — declarative step→tier table (DESIGN.md §4.1).
  - `zipline route <step>` → tier; on contract-fail, escalate one tier and re-run.
  - Auto-demote: if a step's cheap-tier fail-rate >40% over last 10 runs, promote
    its default tier in `policy.yaml`.
- **Test:** Replay the M1 step set through the router; compare total token-cost and
  pass-rate against an always-Opus baseline over the same steps.
- **Success criterion:**
  1. **Pass-rate parity:** router pass-rate ≥ always-Opus pass-rate − 2pts.
  2. **Cheaper:** router total cost ≤ 60% of always-Opus cost.
  3. Auto-demote fires correctly on a seeded high-fail step (verified in ledger).
- **Gate → M3:** policy changes are observable — every tier decision and every
  demote is in the ledger with a reason.

## M3 — Contracts (typed I/O + generated prompts)

- **Goal:** Every step is a typed function with a Zod input/output schema; prompts
  are generated from the contract + compiled bundle, never hand-written freeform.
- **Hypothesis:** Schema-validated I/O shortens outputs, enables automatic retry on
  malformed output, and removes prompt-authoring as a source of imprecision.
- **Build:**
  - Zod schemas for each step type; a prompt generator `(contract, bundle) → prompt`.
  - Output validator; on schema-fail, one repair retry before escalation (M2).
- **Test:** Feed 20 steps including 5 adversarial ones designed to produce malformed
  output; measure schema-valid rate after the repair retry.
- **Success criterion:**
  1. **Valid-output rate ≥ 95%** after ≤1 repair retry.
  2. **Output-token reduction:** median `tokens_out` ≥ 20% below the same steps run
     without a schema (freeform), measured from the ledger.
- **Gate → M4:** malformed output never silently proceeds — it is logged and either
  repaired or escalated, never passed downstream.

## M4 — The Loop (design→plan→gate→build→verify)

- **Goal:** Compose M1–M3 into the full build loop, invoking gstack skills as leaf
  work-steps, with a milestone GATE that re-plans against actuals.
- **Hypothesis:** hypothesis→debate→converge design + milestone gates produces a
  spec and an implementation that pass verification without human steering on a
  real, small feature.
- **Build:**
  - DESIGN step: hypothesis → debate (Sonnet ×N varied roles) → converge → design.md.
  - PLAN step: design → milestones with success criteria (this file's shape).
  - Per-milestone GATE that reads prior actuals and amends the next plan.
  - VERIFY via `santa-method` (2 independent reviewers must pass), invoked headless.
  - Orchestrator boundary enforced: spine owns routing/context/ledger; skills are
    leaves (DESIGN.md §5).
- **Test:** Point the loop at one real small feature in a scratch repo; let it run
  autonomously to completion with the human only approving the final PR.
- **Success criterion:**
  1. Loop reaches a VERIFY-passing state with **0 human interventions** in the inner
     loop (approvals at gates only).
  2. Two `santa-method` reviewers both PASS the output.
  3. Total run cost logged and ≤ a stated ceiling for the feature size.
- **Gate → M5:** every STUCK terminated cleanly (no infinite loops) across the run.

## M5 — Learning (ledger → self-tuning policy)

- **Goal:** The system improves its own routing policy and compiler selection from
  accumulated ledger data, and feeds durable lessons to `continuous-learning-v2`.
- **Hypothesis:** Policy auto-tuned from ≥100 logged runs beats the hand-written
  starting policy on cost at equal pass-rate.
- **Build:**
  - Batch job: read ledger → recompute per-step optimal tier → propose `policy.yaml`
    diff (human approves the diff; not silent).
  - Compiler tuning: rules frequently in `rules_excluded` with no correctness loss
    get de-prioritized; rules whose absence correlates with failures get pinned.
  - Emit durable lessons into `continuous-learning-v2` / `learn`.
- **Test:** Freeze a 100-run ledger; generate a tuned policy; replay the M2 step set
  under both policies.
- **Success criterion:** tuned policy total cost ≤ 90% of starting policy at
  pass-rate parity (±2pts); every policy change traceable to ledger evidence.
- **Gate → M6:** no tuning change ships without a human-approved diff.

## M6 — Token-economy dashboard  *(EXPANSION)*

- **Goal:** Make savings and policy behavior visible so the feedback loop is
  something you can see, not just a number in a JSONL file.
- **Hypothesis:** A single `zipline report` view (savings over time, cost per step
  type, escalation/demote events, stuck rate) surfaces regressions within one run.
- **Build:** `zipline report` — reads the ledger, renders per-step savings, tier
  mix, escalation rate, and a savings-over-time trend.
- **Test:** Run against a populated ledger; assert every metric the ledger records
  appears and reconciles with raw ledger sums.
- **Success criterion:** report totals reconcile exactly with ledger aggregates; a
  seeded savings regression is visible in the trend without reading raw JSONL.
- **Gate → M7:** none (leaf feature).

## M7 — Cross-project policy  *(EXPANSION — the durable product)*

- **Goal:** The routing policy and compiled-context format become a portable,
  versioned artifact shared and improved across all your repos.
- **Hypothesis:** A policy trained on many repos generalizes — a fresh repo adopting
  the shared policy starts closer to optimal than a cold hand-written one.
- **Build:** `zipline policy pull/push` against a central versioned policy; per-repo
  overrides layered on top; provenance recorded.
- **Test:** Adopt the shared policy in a repo it was never trained on; compare
  cold-start cost vs the M2 hand-written policy on that repo's step set.
- **Success criterion:** shared-policy cold-start total cost ≤ hand-written policy
  cost at pass-rate parity on a held-out repo.
- **Gate:** none (terminal milestone).

---

## Scope ledger (EXPANSION decisions)

| # | Milestone | In scope | Note |
|---|---|---|---|
| M0 | Autonomy zipline | ✅ | Enables self-running loops — the thing you asked for |
| M1 | Compiler + Ledger | ✅ | Make-or-break, hard GO/NO-GO gate |
| M2 | Router | ✅ | Anthropic tiers only |
| M3 | Contracts | ✅ | |
| M4 | Loop | ✅ | |
| M5 | Learning | ✅ | |
| M6 | Dashboard | ✅ EXPANSION | Cut if you want a leaner v1 |
| M7 | Cross-project policy | ✅ EXPANSION | The durable, portable artifact |
| M8 | Integrations layer | ✅ EXPANSION | 5 native capabilities + accelerators + `zipline doctor`; connect-the-pipe intercept |
| M9 | Docs (Mermaid) | ✅ EXPANSION | Architecture diagrams in README + docs/ARCHITECTURE.md |
| M10 | Real LLM calls | ✅ EXPANSION | `claude` CLI subscription (no API key) + deterministic simulate stub; real tokens_out |
| M11 | PostToolUse compress | ✅ EXPANSION | `zipline compress-output` replaces Bash stdout via updatedToolOutput; ~63% reduction |
| M12 | terse auto-disable | ✅ EXPANSION | `resolveAvailability` shows disabled in doctor when terse net-delta goes negative |
| M13 | Cross-project policy sync | ✅ EXPANSION | `zipline policy pull/push`; repo overrides win; provenance logged |
| M14 | Continuous-learning | ✅ EXPANSION | `zipline learn` proposes rule pins/de-prioritize from ledger; proposal-only |
| M16 | Stable public API | ✅ v1 GATE | Versioned barrel + `LEDGER_SCHEMA_VERSION`; pre-v1 ledgers still parse |
| M17 | terse A/B output-delta | ✅ v1 GATE | Real no-terse baseline measures OUTPUT delta; feeds auto-disable |
| M18 | Optional gstack | ✅ v1 GATE | Detected, never invoked; honest degradation in `zipline doctor` |
| M19 | Hook performance | ✅ v1 GATE | Hard 150ms budget; intercept ~0.5ms, compress ~3ms/4000-line log |
| M20 | Fable tier | ✅ FABLE-ERA | Architect tier (~2× opus) off the escalation ladder; assigned by policy only |
| M21 | Effort axis | ✅ FABLE-ERA | `tier@effort` → `claude --effort`; xhigh/max opt-in only; optional ledger field |
| M22 | Cost-regression demotion | ✅ FABLE-ERA | Shared `router.ts`; demote on overthinking; effort before tier; reliability wins |
| M23 | Budget breaker | ✅ FABLE-ERA | `ZIPLINE_MAX_TOKENS` halts runaway loops; schema-safe STUCK + budget-halt note |
| M24 | Bloat detection | ✅ | Detect & prevent context bloat from structural and cache issues; safe auto-fix |

---

## M8 — Integrations layer (native-first, accelerator-optional)

- **Goal:** Leverage best-in-class efficiency tools automatically. Each capability
  is replicated natively in TypeScript (always-on) and uses a real external tool as
  an accelerator when detected. The user never picks a tool. No hard deps.
- **Build:** `src/integrations/` — `detect.ts` (cached `RepoEnv`), 5 capabilities
  (output-compress, symbol-query, doc-fetch, terse-output, decision-log), `registry.ts`
  (tag-based `selectCapabilities`), `index.ts` (`runCapability` + net-delta + auto-disable).
  `zipline doctor` shows per-repo availability. `zipline intercept` compiles + injects
  real context on `UserPromptSubmit` and logs real `tokens_in`.
- **Success criterion:** 20 gates pass — intercept savings; compress ≥40% on a noisy log
  (hit 66.6%); symbol-query returns a real type without whole-file reads; non-TS
  degradation; decision-log net-delta exempt; auto-disable window guard; tag selection.
- **Gate → M9:** capabilities degrade honestly per-repo (doctor shows inactive, no crash).

## M9 — Docs (Mermaid diagrams)

- **Goal:** Make the architecture legible on GitHub with native-rendering diagrams.
- **Build:** `docs/ARCHITECTURE.md` (system overview flowchart, request data-flow
  sequenceDiagram, capability-selection flowchart) + README Integrations section and
  at-a-glance diagram. Hero SVG cut (gold-plating).
- **Success criterion:** Mermaid fences valid and render on GitHub; README documents
  the integrations layer and `zipline doctor`.
- **Gate:** none (leaf).

---

## M20–M23 — Fable-era routing

Prompted by Fable 5 becoming a first-class, expensive default. The router could
not previously express Fable, reasoning effort, cost-based demotion, or a spend
ceiling. All four are backward-compatible (no ledger schema bump; old
`policy.yaml` still parses; budget off by default).

### M20 — Fable tier

- **Goal:** Let the router reason about Fable without ever escalating into it.
- **Build:** `fable` added to `Tier`, `TIER_COST` (2×), `TIER_MODEL`; new
  `ALL_TIERS` carries it for cost/reporting while `TIER_ORDER` (the escalation
  ladder) stays `haiku/sonnet/opus`. `nextTier` caps at opus and returns opus for
  off-ladder input. Design-synthesis converge + `DEFAULT_POLICY` default to fable.
- **Success criterion:** `test:m20` — fable priced above opus; escalation from any
  tier provably never reaches fable; policy can assign fable; `callModel` routes it.

### M21 — Reasoning-effort axis

- **Goal:** Add effort as a second cost axis; never default to a furnace.
- **Build:** `Effort` + `DEFAULT_EFFORT_BY_TIER` (low/medium/high; never
  xhigh/max). `PolicyEntry = Tier | {tier, effort}`; `parsePolicy` accepts
  `tier@effort` and bare tiers round-trip byte-identically. `callModel(prompt,
  tier, effort)` → `claude --effort`. Optional `effort` ledger field (additive).
- **Success criterion:** `test:m21` — both policy forms round-trip; default map
  correct; xhigh never auto-assigned; effort persists; pre-M21 entries still parse.

### M22 — Cost-regression demotion

- **Goal:** Demote a tier that passes but overthinks, not just one that fails.
- **Build:** `src/router.ts` `assessRoute` — extracted from the M2 sim (now a
  shared decision). Fail-rate escalation unchanged; new overthinking trigger fires
  on ballooning `tokens_out` at healthy pass-rate, cutting **effort before tier**.
  Reliability wins ties.
- **Success criterion:** `test:m22` — overthinking cuts effort first then tier;
  fable steps to opus; healthy holds; failing+expensive still escalates; M2 intact.

### M23 — Budget circuit-breaker

- **Goal:** Stop a runaway autonomous loop before it burns a fortune.
- **Build:** `src/budget.ts` (`ZIPLINE_MAX_TOKENS`); `runMilestone`/`runM4Loop`
  halt before the next expensive step once cumulative tokens reach the cap. Halt
  persists as schema-safe `STUCK` + `budget-halt:` note (internal `LoopOutcome`
  `"BUDGET"` never written). `zipline report` counts budget halts.
- **Success criterion:** `test:m23` — small cap halts before maxAttempts and stops
  within one step of the cap; report counts it; no cap = zero behavior change.

---

## M24 — Context Bloat Detection & Prevention

- **Goal:** Detect and prevent context bloating from structural issues (overweight
  rules, redundant content, broad tags), cache inefficiency (repeated compilations),
  compression degradation, and escalation spirals — so zipline's savings don't
  silently erode over time.
- **Hypothesis:** Cheap ledger + rules scan can detect all four bloat vectors and
  produce actionable recommendations. Auto-fix can safely split/merge rules without
  breaking the compiler.
- **Build:** `src/bloat-detector.ts` (detection thresholds + safe auto-fix) +
  `zipline bloat [--fix] [--dry-run]` CLI command. Four vectors:
  1. **Structural bloat** — rules >1500 tokens, redundant pairs >60% overlap, tags
     hitting >10 rules
  2. **Cache inefficiency** — repeated compilations, cache hit rate <50%
  3. **Compression degradation** — declining savings trend (last 10 vs prior 10)
  4. **Escalation spirals** — ≥3 escalations in 20-entry window without settling
  
  Auto-fix splits overweight rules at headings, merges redundant pairs (union tags,
  append unique lines). Dry-run previews changes.
- **Test:** `test:m24` — 7 gates: module exists; detects all four vectors; auto-fix
  safely splits and merges rules; report renders actionable items.
- **Success criterion (all required):**
  1. Detection runs in <100ms (one ledger + rules read)
  2. All thresholds conservative (no false positives on healthy repos)
  3. Auto-fix is reversible and safe (verified by gates 6-7)
  4. Report severity escalates to `critical` on spirals
- **Gate → later:** detection is passive (no hooks, no automatic runs); integrate
  into CI or run manually when savings drop.
