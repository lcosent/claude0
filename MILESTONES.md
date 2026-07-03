# harness — Milestones

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
TEST    run the test command → capture metrics into .harness/ledger.jsonl
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

## M0 — Skeleton + autonomy harness

- **Goal:** A runnable spine that can execute one trivial milestone end-to-end
  through the LOAD→TEST→CHECK loop, so the machinery itself is proven before real
  work rides on it.
- **Hypothesis:** The loop state machine can drive a step, capture a metric to the
  ledger, and make a PASS/FAIL/STUCK decision with zero human input.
- **Build:**
  - `.harness/` convention: `config.yaml`, `ledger.jsonl`, `rules/`, `milestones/`.
  - `harness run <milestone-id>` — executes the LOAD→BUILD→TEST→CHECK loop.
  - Ledger writer (append-only JSONL) with the DESIGN.md §4.5 schema.
  - A no-op "hello" milestone whose success is "ledger has 1 entry with pass=true."
- **Test:** `harness run hello` then assert the ledger tail parses and `pass==true`.
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
  - `harness compile <step>` → bundle with `objective, constraints, artifacts,
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
  - `harness route <step>` → tier; on contract-fail, escalate one tier and re-run.
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
- **Hypothesis:** A single `harness report` view (savings over time, cost per step
  type, escalation/demote events, stuck rate) surfaces regressions within one run.
- **Build:** `harness report` — reads the ledger, renders per-step savings, tier
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
- **Build:** `harness policy pull/push` against a central versioned policy; per-repo
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
| M0 | Autonomy harness | ✅ | Enables self-running loops — the thing you asked for |
| M1 | Compiler + Ledger | ✅ | Make-or-break, hard GO/NO-GO gate |
| M2 | Router | ✅ | Anthropic tiers only |
| M3 | Contracts | ✅ | |
| M4 | Loop | ✅ | |
| M5 | Learning | ✅ | |
| M6 | Dashboard | ✅ EXPANSION | Cut if you want a leaner v1 |
| M7 | Cross-project policy | ✅ EXPANSION | The durable, portable artifact |
| M8 | Integrations layer | ✅ EXPANSION | 5 native capabilities + accelerators + `harness doctor`; connect-the-pipe intercept |
| M9 | Docs (Mermaid) | ✅ EXPANSION | Architecture diagrams in README + docs/ARCHITECTURE.md |
| M10 | Real LLM calls | ✅ EXPANSION | `claude` CLI subscription (no API key) + deterministic simulate stub; real tokens_out |

---

## M8 — Integrations layer (native-first, accelerator-optional)

- **Goal:** Leverage best-in-class efficiency tools automatically. Each capability
  is replicated natively in TypeScript (always-on) and uses a real external tool as
  an accelerator when detected. The user never picks a tool. No hard deps.
- **Build:** `src/integrations/` — `detect.ts` (cached `RepoEnv`), 5 capabilities
  (output-compress, symbol-query, doc-fetch, terse-output, decision-log), `registry.ts`
  (tag-based `selectCapabilities`), `index.ts` (`runCapability` + net-delta + auto-disable).
  `harness doctor` shows per-repo availability. `harness intercept` compiles + injects
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
  the integrations layer and `harness doctor`.
- **Gate:** none (leaf).
