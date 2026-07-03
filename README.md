# harness

**Deterministic orchestration spine for Claude Code**

Harness is a token-optimizing layer that sits between you and Claude Code. Instead of dumping your entire CLAUDE.md into every prompt, it compiles the minimal context each step needs — saving 60-70% of input tokens while preserving correctness.

## Problem

Building with Claude Code wastes tokens:
- CLAUDE.md grows unbounded (thousands of tokens per prompt)
- Context bloat → slower responses, higher cost
- No visibility into what rules actually matter per task
- Models picked manually instead of by step requirements

## Solution

Harness enforces three disciplines:

1. **Context is compiled, not accumulated**  
   Every step gets only the rules it needs, freshly assembled from `.harness/rules/*.md`

2. **Every step declares a contract**  
   Inputs bounded, outputs schema'd, model chosen by step type (Haiku/Sonnet/Opus)

3. **The loop learns from runs**  
   Append-only ledger logs `tokens_in`, `baseline_tokens`, savings — proving value per operation

## Installation

```bash
npm install -g harness
```

Or from source:

```bash
cd harness
npm install
npm run build
npm link   # Makes `harness` command available globally
```

## Quick Start

```bash
# Initialize in your project
cd my-project
harness init

# Creates:
#   .harness/rules/          (6 sample rules: typescript, git, security, etc.)
#   .harness/policy.yaml     (routing policy: step → tier)
#   .harness/ledger.jsonl    (empty log)
#   .claude/settings.json    (hook configured)

# From now on: just use Claude Code
claude> fix the auth bug
# Harness intercepts, compiles context, routes to appropriate tier, logs savings

# Check what happened
harness report
```

## Status

**Current:** M0-M3, M5-M7 implemented and passing  
**Next:** M4 (full DESIGN → PLAN → BUILD → VERIFY loop)

### Milestones

- ✅ **M0**: Skeleton + autonomy harness (hello/always-fail milestones)
- ✅ **M1**: Context compiler + ledger (64.4% median savings, passed GO/NO-GO gate)
- ✅ **M2**: Router (Haiku/Sonnet/Opus, escalation, auto-demote)
- ✅ **M3**: Contracts (typed I/O, schema validation, 70% output token reduction)
- ❌ **M4**: The Loop (DESIGN → PLAN → GATE → BUILD → VERIFY) — **in progress**
- ✅ **M5**: Learning (ledger → self-tuning policy, 75% of starting cost)
- ✅ **M6**: Token-economy dashboard (`harness report`)
- ✅ **M7**: Cross-project policy (shared rules/policy across repos)

## Usage

### Transparent (After Init)

Once initialized, harness is always-on via Claude Code hook:

```bash
claude> add a React modal component
# Behind the scenes:
# - Compiler selects rules: [react-ui.md, typescript-style.md]
# - Router picks Sonnet (implementation task)
# - Ledger logs: tokens_in=120, baseline_tokens=380, savings=68.4%
```

### Explicit Orchestration

For complex features, invoke the full loop:

```bash
claude> /harness build "add user authentication with JWT"
# Runs:
#   DESIGN: hypothesis → debate (varied roles) → converge → design.md
#   PLAN: design → milestones with success criteria
#   Per milestone: GATE → BUILD → VERIFY (santa-method)
```

### Reporting

```bash
harness report
# Shows:
#   Total runs, pass rate, escalations, stuck count
#   Token savings % (baseline vs compiled)
#   Tier mix (how often Haiku/Sonnet/Opus used)
#   Savings by milestone with regression detection

harness report --global
# Aggregate stats across all repos using harness
```

### Manual Compilation

```bash
harness compile "fix auth bug" "typescript,security,testing"
# Output:
#   Baseline tokens:  265
#   Compiled tokens:  135
#   Savings:          49.1%
#   Rules included:   security.md, testing.md, typescript-style.md
```

## Architecture

```
harness (TypeScript, runs as CLI + Claude Code hook)
  ├─ COMPILER   goal + tags → minimal context bundle (src/compiler.ts)
  ├─ ROUTER     step → Anthropic tier (Haiku/Sonnet/Opus) (src/policy.ts)
  ├─ CONTRACTS  Zod schemas for typed I/O (src/contract.ts)
  ├─ LOOP       design → plan → gate → build → verify (src/loop.ts)
  └─ LEDGER     append-only JSONL log (src/ledger.ts)
       ↓ reads/writes
  .harness/     per-repo state directory
    ├─ rules/           one .md file per concern, frontmatter-tagged
    ├─ policy.yaml      step → tier mapping (auto-tuned over time)
    └─ ledger.jsonl     every operation logged for learning
```

## Rules Format

Each rule is a markdown file in `.harness/rules/` with frontmatter tags:

```markdown
---
tags: [typescript, security]
---
Sanitize all user input. Never construct SQL with string concatenation.
Use parameterized queries. Check authorization at every handler.
```

The compiler selects rules by matching step tags. E.g., a step tagged `[typescript, security]` gets only those rules, not the full CLAUDE.md.

## Policy Format

`.harness/policy.yaml` maps step types to Anthropic tiers:

```yaml
context-compile: haiku       # Mechanical summarization
structured-extract: haiku
unit-test-write: sonnet      # Needs judgment
implement-small-fn: sonnet
design-synthesis: opus       # Quality dominates cost
```

On validation failure, the router escalates one tier. If a step's cheap-tier fail-rate >40% over 10 runs, it auto-promotes to the next tier.

## Ledger Schema

Every operation appends to `.harness/ledger.jsonl`:

```json
{
  "ts": "2026-07-03T12:34:56Z",
  "milestone": "M1",
  "step": "fix-auth-bug",
  "attempt": 1,
  "tier": "sonnet",
  "tokens_in": 135,
  "tokens_out": 420,
  "baseline_tokens": 265,
  "pass": true,
  "metric": 0.491,
  "outcome": "PASS",
  "retries": 0,
  "rules_included": ["security.md", "typescript-style.md"],
  "rules_excluded": ["git-safety.md", "react-ui.md"],
  "note": "savings=49.1%"
}
```

This makes token savings **falsifiable** — you can always reconstruct what full-context would have cost.

## Testing

```bash
npm test           # Run all milestone tests
npm run test:m1    # M1: Compiler + Ledger (GO/NO-GO gate)
npm run test:m2    # M2: Router (escalation + auto-demote)
npm run test:m3    # M3: Contracts (schema validation)
npm run test:m5    # M5: Learning (policy tuning)
npm run test:m6    # M6: Dashboard (report reconciliation)
npm run test:m7    # M7: Cross-project policy
```

All tests use the existing `.harness/` fixtures in this repo.

## Design Documents

- **[DESIGN.md](./DESIGN.md)** — Architecture, risks, build sequence, gstack review
- **[MILESTONES.md](./MILESTONES.md)** — Detailed success criteria per milestone

## Roadmap

### v0.1 (Current)
- ✅ Compiler, Router, Contracts, Ledger, Reporting
- ✅ CLI: `init`, `report`, `compile`
- ❌ M4: Full loop (DESIGN → VERIFY)
- ❌ Hook integration (intercept Claude Code prompts)

### v0.2 (Next)
- M4 implementation (design debate, milestone gates, santa-method verify)
- Hook: transparent context compilation on every `claude>` prompt
- Cross-project policy sync (`harness policy pull/push`)

### v1.0
- Stable API for rules, policy, ledger schema
- Integration with gstack skills (optional orchestration leaves)
- `continuous-learning-v2` pipeline (ledger → new rules/skills)

## Non-Goals

- **Not replacing gstack/rtk** — harness orchestrates them, doesn't duplicate
- **Not a hosted product** — portable across your repos, runs locally
- **Not model-training** — "learning" = updating policy/rules from outcomes

## License

ISC

## Author

Luca
