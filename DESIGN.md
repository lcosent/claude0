# claude0 — Design Document

**Status:** Draft v0.1
**Date:** 2026-07-02
**Owner:** Luca

---

## 1. Problem

Building with Claude Code wastes tokens, bloats context, produces long imprecise
prompts, mismanages loops/goals, and uses models inefficiently. CLAUDE.md and
similar files grow unbounded. Solution design is one-shot instead of iterated.
Milestones don't get re-reviewed against actual progress. Agents don't improve.

## 2. Thesis

Don't build a new agent framework. Build a thin **deterministic spine** over the
Anthropic models (Haiku / Sonnet / Opus) that enforces three disciplines Claude
Code doesn't enforce on its own. Model choice is tier-within-family, not
local-vs-cloud; the design is tool-agnostic and does not depend on any local
model or router.

1. **Context is compiled, not accumulated.** Every step gets the minimum context
   it needs, freshly assembled — never the whole CLAUDE.md.
2. **Every step declares a contract.** Inputs bounded, outputs schema'd, model
   chosen by the step's nature.
3. **The loop learns from its own runs.** Outcomes feed the routing table, the
   context compiler, and skill selection.

## 3. Non-goals

- Not replacing gstack, rtk, or the local router — it orchestrates them.
- Not a hosted product (for now): portable across *my* repos, gstack-optional.
- Not model-training; "learning" = updating policy/rules from run outcomes.

## 4. Architecture — 5 components

```
claude0 spine (TS, Claude Agent SDK)
  1. ROUTER     step → model (local reasoning/chat vs Opus/Sonnet, by policy)
  2. COMPILER   goal + state → minimal context bundle
  3. CONTRACTS  per-step I/O schemas (Zod) + token budgets
  4. LOOP       design → plan → milestone-gate → build → verify
  5. LEDGER     append-only run log → feeds learning
        ↓ calls out to            ↑ reads/writes
  gstack skills, rtk, local router   .claude0/ state dir (per repo)
```

### 4.1 Router — step→model mapping

Declarative policy table mapping each step to an Anthropic tier. Cheap tiers do
mechanical work; expensive tiers do the work where quality dominates cost.

| Step | Tier | Why |
|---|---|---|
| Context compilation | Haiku | Mechanical summarization / selection |
| Structured extraction | Haiku | Deterministic, schema-bound |
| Verification / tests | Sonnet | Needs judgment, escalate on fail |
| Debate / critique | Sonnet ×N (varied prompts) | Independent second opinions from one family |
| Implementation | Sonnet (Opus for hard) | Escalate on retry |
| Design synthesis | Opus | The step where quality dominates cost |

**Escalation rule:** start at the cheapest tier that can plausibly pass the
step's contract; escalate one tier only when contract validation fails. **Auto-
demote:** if the Ledger shows a step's cheap-tier fail-rate crosses a named
threshold, the policy promotes its default tier so retries don't cost more than
starting high. Threshold: demote after fail-rate >40% over the last 10 runs.

**Diversity note:** since debate uses one model family, get uncorrelated opinions
via varied prompts/roles (skeptic, proponent, edge-case hunter) and temperature,
not different vendors.

### 4.2 Context Compiler

The fix for CLAUDE.md bloat: **CLAUDE.md stops being the context — it becomes a
source.** Split into `rules/*.md` (one concern each, tagged); the compiler selects.

```
compile(goal, step, state) → {
  objective:   1 sentence
  constraints: only rules matching this step
  artifacts:   only files this step touches (from the plan)
  memory:      relevant prior decisions (from LEDGER, semantic match)
  budget:      hard token ceiling; over → summarize, not truncate
}
```

Highest-leverage piece. Build first.

### 4.3 Contracts

Every step is a typed function `(InputSchema) → (OutputSchema)` (Zod). Forces
short structured I/O, enables auto-retry on malformed output. Prompts are
*generated* from contract + compiled context — no hand-built freeform prompts.

### 4.4 The Loop

```
DESIGN   hypothesis → debate (2 local models) → converge → design.md
         iterate until reviewers agree (wraps santa-method + plan-review panels)
PLAN     design → milestones[], each {job-to-be-done, success-criteria, files}
per milestone:
  GATE   re-plan THIS milestone against actuals from prior milestone's LEDGER
         (plan is advisory, actuals are truth)
  BUILD  implement to contract
  VERIFY success-criteria — santa-method: 2 reviewers must pass → record outcome
```

The GATE step makes "review each milestone against prior progress" mechanical.

### 4.5 Ledger + Learning

Append-only `.claude0/ledger.jsonl`. Every step records:
`{step, tier, tokens_in, tokens_out, baseline_tokens, pass/fail, retries,
rules_included[], rules_excluded[]}`.

- `baseline_tokens` = what naive full-context would have cost. **This is what
  makes the whole premise falsifiable:** every run proves or disproves savings.
- `rules_included/excluded` make the compiler's selection visible, so a dropped-
  but-needed rule is auditable instead of a silent wrong answer.

Two feedback loops:
- **Immediate:** routing policy adjusts (a step that always escalates gets
  promoted to the higher tier by default).
- **Cross-session:** piped into `continuous-learning-v2` / `learn` to spawn new
  rules and skills.

## 5. Build sequence

Full 5-component spine is the committed scope, built in dependency order with a
hard go/no-go gate. The gate enforces risk #3: if the Compiler doesn't measurably
cut tokens, stop before building the Loop.

1. **Compiler + Ledger** — `claude0 compile <step>` → minimal bundle; ledger logs
   `tokens_in` vs `baseline_tokens`. **GO/NO-GO GATE:** median savings ≥30% across
   a real repo's steps, with no correctness regression. Fail → stop and rethink.
2. **Router** — `claude0 route <step>` → Anthropic tier + escalation + auto-demote.
3. **Contracts** — Zod I/O schemas; prompts generated from contract + bundle.
4. **Loop** — design→plan→gate→build→verify, invoking gstack skills as leaf steps.
5. **Learning** — ledger feeds policy auto-tuning + `continuous-learning-v2`.

### Orchestrator boundary (critical)

The spine and gstack must not both drive. Rule: **the spine owns routing, context
compilation, and the ledger. gstack skills are leaf work-steps, invoked headless,
never nested orchestrators.** When the Loop calls `santa-method`, the spine picks
the tier and supplies the compiled bundle; the skill does the work and returns.

## 6. Open decisions

- Scope: portable-across-my-projects (assumed).
- Relationship: orchestration spine over gstack, gstack-optional (assumed).
- Mechanism: TS spine (Claude Agent SDK) for routing/orchestration; gstack skills
  invoked headless as leaf steps.
- Models: Anthropic family only (Haiku/Sonnet/Opus). No local-model dependency.

## 7. Risks

- **Spine rot** — Claude Code / Agent SDK ships faster than the spine is patched.
  Mitigate: keep the runner thin; the durable product is the *policy* and the
  *compiled-context format* (both data), not the code that reads them.
- **Compiler drops a needed rule → silent wrong output** (worst case, invisible).
  Mitigate: over-include conservatively, log `rules_included/excluded`, narrow
  only as ledger data justifies.
- **Escalation costs more than it saves** — mitigated by ledger-driven auto-demote
  (>40% cheap-tier fail-rate → promote default tier).
- **Over-building** — the step-1 GO/NO-GO gate is the kill-switch. No Loop until
  the Compiler proves ≥30% token savings.
- **Two orchestrators fighting** — mitigated by the §5 orchestrator boundary.

---

## GSTACK REVIEW REPORT

| Run | Status | Findings |
|---|---|---|
| plan-ceo-review (HOLD SCOPE) | done | 6 failure modes; 3 resolved in-doc, 3 turned into design rules |

**Resolved into the design:**
1. Build order — added §5 sequence with GO/NO-GO gate after Compiler.
2. Token-savings unfalsifiable — Ledger now logs `baseline_tokens`; 30% gate.
3. Escalation cost — auto-demote rule (>40% fail-rate) added to §4.1.
4. Compiler silent-drop — `rules_included/excluded` logged; conservative over-inclusion.
5. Two orchestrators — §5 orchestrator boundary (spine drives, skills are leaves).
6. Local-model dependency & swap-thrashing — removed entirely; Anthropic tiers only.

**VERDICT:** APPROVED to build. Scope held at 5 components. Start at step 1
(Compiler + Ledger); do not build the Loop until the 30%-savings gate passes.

**UNRESOLVED DECISIONS:**
- Mode letter not explicitly returned by user; proceeded as HOLD SCOPE (greenfield
  infra, risk is over-building). Say the word to switch to EXPANSION/SELECTIVE.
