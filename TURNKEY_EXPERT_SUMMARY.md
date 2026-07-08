# Turnkey vs Expert Mode — Implementation Summary

**Version:** 1.2.0  
**Date:** 2026-07-08  
**Goal:** Make zipline usable by both newbies (simple) and experts (full control)

## What Changed

Zipline now has two modes that serve different user needs:

### Turnkey Mode (Default)
**For:** Beginners who want "just works"
- Zero configuration decisions
- Managed routing policy (locked header)
- Simple command set (`init`, `status`, `expert`, `uninstall`)
- Simplified help text
- New `zipline status` command (simple savings summary)

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
zipline init [--expert]   # Init in expert mode (default: turnkey)
zipline status            # Simple savings summary (new)
zipline expert            # Upgrade to expert mode
zipline turnkey           # Downgrade to turnkey mode
```

## User Journeys

### Journey 1: Beginner Forever
```bash
zipline init        # Done. That's it.
zipline status      # Check savings
# Never switches to expert, happy with defaults
```

### Journey 2: Beginner → Power User
```bash
zipline init        # Start simple
# ... weeks later ...
zipline expert      # Unlock features
vim .zipline/policy.yaml
zipline doctor
zipline learn
```

### Journey 3: Expert from Start
```bash
zipline init --expert    # Skip turnkey
vim .zipline/policy.yaml
zipline doctor
```

## Mode Storage

**File:** `.zipline/mode.json`

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
# This policy is managed by zipline (turnkey mode).
# Run 'zipline expert' to unlock for manual editing.
# Routing: haiku (cheap/fast) → sonnet (balanced) → opus (hard tasks) → fable (architecture/design)
```

**Expert (unlocked):**
```yaml
# Zipline routing policy (expert mode — edit freely)
# Maps step types to Anthropic model tiers: haiku/sonnet/opus/fable
# Lower tiers are cheaper; escalation happens on contract validation failure.
# fable is the architect tier (~2x opus) — assign it only to planning/review,
# never to mechanical work. Escalation never promotes a step into fable.
# Advanced: use tier@effort for reasoning overrides (e.g., opus@xhigh)
```

## Help Text Examples

### Turnkey Help
```
Zipline — Save 65% on Claude Code tokens, automatically

Usage:
  zipline init [--expert]         Set up zipline in your project
  zipline status                  Check how much you're saving
  zipline expert                  Unlock advanced features
  zipline uninstall [--force]     Remove zipline

Want more control? Run 'zipline expert' for advanced commands.
```

### Expert Help
```
Zipline — deterministic orchestration spine for Claude Code

Usage:
  zipline init [--expert] [--global]     Initialize .zipline/ in current dir
  zipline status                         Simple savings summary
  zipline report [--global]              Detailed token savings and system metrics
  zipline compile "goal" tags            Compile context bundle for a step
  zipline doctor                         Show integrations stack
  zipline policy <pull|push>             Sync routing policy
  zipline learn [--apply]                Propose rule changes
  zipline bloat [--fix] [--dry-run]      Detect context bloat
  zipline turnkey                        Switch to turnkey mode
  zipline uninstall [--global] [--force] Remove .zipline/ and hooks
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
