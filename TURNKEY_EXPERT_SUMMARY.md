# Turnkey vs Expert Mode — Implementation Summary

**Version:** 1.2.0  
**Date:** 2026-07-08  
**Goal:** Make claude0 usable by both newbies (simple) and experts (full control)

## What Changed

ClaudeZero now has two modes that serve different user needs:

### Turnkey Mode (Default)
**For:** Beginners who want "just works"
- Zero configuration decisions
- Managed routing policy (locked header)
- Simple command set (`init`, `status`, `expert`, `uninstall`)
- Simplified help text
- New `claude0 status` command (simple savings summary)

### Expert Mode (Opt-in)
**For:** Power users who want full control
- Unlocked policy editing
- All advanced commands visible (`compile`, `doctor`, `policy`, `learn`, `bloat`)
- Detailed help text
- Per-step tier overrides
- Cross-repo policy sync

## Files Changed

### New Files
- `src/mode.ts` — Mode detection and switching utilities
- `src/mode-test.ts` — Test suite for mode functionality
- `docs/MODES.md` — Mode design documentation
- `QUICKSTART.md` — 30-second beginner guide
- `TURNKEY_EXPERT_SUMMARY.md` — This file

### Modified Files
- `src/cli.ts` — Added mode-aware commands and help text
- `src/init-templates.ts` — Separate policy headers for turnkey/expert
- `package.json` — Version bump to 1.2.0, added mode test
- `README.md` — Simplified, beginner-focused, links to QUICKSTART
- `CHANGELOG.md` — Documented v1.2.0 changes

## New Commands

```bash
claude0 init [--expert]   # Init in expert mode (default: turnkey)
claude0 status            # Simple savings summary (new)
claude0 expert            # Upgrade to expert mode
claude0 turnkey           # Downgrade to turnkey mode
```

## User Journeys

### Journey 1: Beginner Forever
```bash
claude0 init        # Done. That's it.
claude0 status      # Check savings
# Never switches to expert, happy with defaults
```

### Journey 2: Beginner → Power User
```bash
claude0 init        # Start simple
# ... weeks later ...
claude0 expert      # Unlock features
vim .claude0/policy.yaml
claude0 doctor
claude0 learn
```

### Journey 3: Expert from Start
```bash
claude0 init --expert    # Skip turnkey
vim .claude0/policy.yaml
claude0 doctor
```

## Mode Storage

**File:** `.claude0/mode.json`

**Turnkey:**
```json
{
  "mode": "turnkey",
  "upgraded_at": null
}
```

**Expert:**
```json
{
  "mode": "expert",
  "upgraded_at": "2026-07-08T14:32:00Z"
}
```

## Policy Headers

**Turnkey (locked):**
```yaml
# This policy is managed by claude0 (turnkey mode).
# Run 'claude0 expert' to unlock for manual editing.
# Routing: haiku (cheap/fast) → sonnet (balanced) → opus (hard tasks) → fable (architecture/design)
```

**Expert (unlocked):**
```yaml
# ClaudeZero routing policy (expert mode — edit freely)
# Maps step types to Anthropic model tiers: haiku/sonnet/opus/fable
# Lower tiers are cheaper; escalation happens on contract validation failure.
# fable is the architect tier (~2x opus) — assign it only to planning/review,
# never to mechanical work. Escalation never promotes a step into fable.
# Advanced: use tier@effort for reasoning overrides (e.g., opus@xhigh)
```

## Help Text Examples

### Turnkey Help
```
ClaudeZero — Save 65% on Claude Code tokens, automatically

Usage:
  claude0 init [--expert]         Set up claude0 in your project
  claude0 status                  Check how much you're saving
  claude0 expert                  Unlock advanced features
  claude0 uninstall [--force]     Remove claude0

Want more control? Run 'claude0 expert' for advanced commands.
```

### Expert Help
```
ClaudeZero — deterministic orchestration spine for Claude Code

Usage:
  claude0 init [--expert] [--global]     Initialize .claude0/ in current dir
  claude0 status                         Simple savings summary
  claude0 report [--global]              Detailed token savings and system metrics
  claude0 compile "goal" tags            Compile context bundle for a step
  claude0 doctor                         Show integrations stack
  claude0 policy <pull|push>             Sync routing policy
  claude0 learn [--apply]                Propose rule changes
  claude0 bloat [--fix] [--dry-run]      Detect context bloat
  claude0 turnkey                        Switch to turnkey mode
  claude0 uninstall [--global] [--force] Remove .claude0/ and hooks
```

## Backward Compatibility

✅ **Fully backward-compatible:**
- Existing repos without `mode.json` default to turnkey
- All commands still work in both modes
- No ledger schema changes
- Old policy files parse correctly
- Expert users can still access all commands (just not shown in help when in turnkey)

## Tests

All tests pass:
```bash
npm test                # Full suite including new mode tests
npm run test:mode       # Mode-specific tests
```

**Test coverage:**
- Mode read/write
- Upgrade/downgrade
- Fallback on malformed JSON
- Policy header rewriting
- Help text rendering per mode

## Documentation

- **QUICKSTART.md** — Absolute beginner guide (30 seconds)
- **docs/MODES.md** — Full mode design and implementation
- **README.md** — Simplified, leads with turnkey experience
- **docs/ARCHITECTURE.md** — Technical details (unchanged, for experts)

## Design Philosophy

**Turnkey:**
- "Just works" out of the box
- Hide all complexity
- No decisions required
- Simple status checking
- 90% of users never need more

**Expert:**
- Full control when needed
- All commands visible
- Policy editing enabled
- Advanced diagnostics
- 10% of users who want to tune

**Key insight:** Don't make beginners think about model tiers, tags, or routing. Give them one command and success. Power users opt in when ready.

## Next Steps

Users can now:
1. Start with turnkey (simple)
2. Upgrade to expert when they want control
3. Downgrade back if they want simplicity again

The experience scales with user sophistication, not against it.
