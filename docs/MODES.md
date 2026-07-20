# Turnkey vs Expert Mode

ClaudeZero has two modes: **turnkey** (simple, managed) and **expert** (full control).

---

## Turnkey Mode (Default)

**Who it's for:** People who want "just works" with zero configuration.

### What you get
```bash
claude0 init      # One command, fully set up
claude0 status    # Simple savings summary
claude0 uninstall # Clean removal
```

### What it does
- Creates 6 proven starter rules
- Installs a **managed routing policy** (you don't edit it)
- Auto-picks which rules matter for each prompt
- Logs everything for tracking
- Shows only essential commands in help

### What it looks like

**Help text:**
```
Usage:
  claude0 init [--expert]         Set up claude0 in your project
  claude0 status                  Check how much you're saving
  claude0 expert                  Unlock advanced features
  claude0 uninstall [--force]     Remove claude0
```

**Policy file (`policy.yaml`):**
```yaml
# This policy is managed by claude0 (turnkey mode).
# Run 'claude0 expert' to unlock for manual editing.

context-compile: haiku
unit-test-write: sonnet
design-synthesis: fable
...
```

**Status output:**
```
ClaudeZero Status
─────────────────────────────────
✓ Saving 41.8% on average          ← real, computed from the ledger
✓ 47 runs, 93.6% success rate
✓ Using mostly Sonnet, rarely Opus

Everything working well.
Run 'claude0 expert' for advanced controls.
```

---

## Expert Mode (Opt-in)

**Who it's for:** Power users who want to tune routing, customize policies, and see detailed diagnostics.

### How to enable

**Option 1: During init**
```bash
claude0 init --expert
```

**Option 2: Upgrade later**
```bash
claude0 expert
```

### What changes

**Unlocked policy:**
```yaml
# ClaudeZero routing policy (expert mode — edit freely)
# Maps step types to Anthropic model tiers: haiku/sonnet/opus/fable
# Advanced: use tier@effort for reasoning overrides (e.g., opus@xhigh)

context-compile: haiku
unit-test-write: sonnet
design-synthesis: fable
risky-refactor: opus@xhigh  # ← You can add custom overrides
...
```

**All commands available:**
```
Usage:
  claude0 init [--expert] [--global]     Initialize .claude0/ in current dir
  claude0 status                         Simple savings summary
  claude0 report [--global]              Detailed token savings metrics
  claude0 compile "goal" tags            Preview context compilation
  claude0 doctor                         Show integrations + diagnostics
  claude0 policy <pull|push>             Sync routing policy across repos
  claude0 learn [--apply]                Propose rule improvements
  claude0 bloat [--fix] [--dry-run]      Detect context bloat
  claude0 turnkey                        Switch back to turnkey mode
  claude0 uninstall [--global] [--force] Remove claude0
```

### What you can do

**1. Edit routing policy**
```bash
vim .claude0/policy.yaml
```
Change which model runs for which task type.

**2. Check integrations**
```bash
claude0 doctor
```
See what tools are active (rtk, MCP servers, etc.).

**3. Get detailed metrics**
```bash
claude0 report
```
Full breakdown: tokens saved per task type, escalation rate, tier mix, regression detection.

**4. Improve rules**
```bash
claude0 learn
```
Get suggestions based on what's actually working.

**5. Find waste**
```bash
claude0 bloat --fix
```
Auto-detect and fix bloated rules, cache misses, compression issues.

**6. Preview compilations**
```bash
claude0 compile "fix auth bug" typescript,security,testing
```
See exactly what would be sent without spending tokens.

---

## Switching Modes

### Turnkey → Expert (Upgrade)
```bash
claude0 expert
```

Output:
```
✓ Upgraded to expert mode

Changes:
  • policy.yaml unlocked for manual editing
  • All advanced commands now available
  • Full control over routing and tuning

Next steps:
  claude0 doctor     — Check integrations
  claude0 report     — Detailed metrics
  claude0 --help     — See all commands
```

### Expert → Turnkey (Downgrade)
```bash
claude0 turnkey
```

Output:
```
✓ Downgraded to turnkey mode

Changes:
  • policy.yaml locked (managed by claude0)
  • Advanced commands hidden from help
  • Simplified command interface

Run 'claude0 status' to check how it's working.
```

---

## How Mode is Stored

File: `.claude0/mode.json`

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

---

## User Journeys

### Journey 1: Beginner Forever
```bash
claude0 init        # Done. One command.
claude0 status      # Check savings occasionally
# Happy with defaults, never switches to expert
```

### Journey 2: Start Simple, Tune Later
```bash
claude0 init                # Start in turnkey
# ... weeks go by, wants more control ...
claude0 expert              # Unlock features
vim .claude0/policy.yaml    # Customize routing
claude0 doctor              # Check what's active
claude0 learn               # Get improvement suggestions
```

### Journey 3: Power User from Start
```bash
claude0 init --expert       # Skip turnkey, go straight to expert
vim .claude0/policy.yaml    # Customize immediately
claude0 doctor              # Check integrations
claude0 compile "task" tags # Preview compilations
```

---

## When to Use Expert Mode

### Stick with turnkey if:
- You want "just works" with zero thinking
- The defaults are working fine
- You don't want to learn model tiers
- You prefer simplicity over control

### Switch to expert if:
- You want to tune which models run when
- You need detailed diagnostics
- You want to optimize rules based on ledger data
- You're curious about what's happening under the hood
- You want cross-repo policy syncing

**Most users (90%) never need expert mode.** Turnkey works great.

---

## Technical Details

### Policy Headers

**Turnkey (locked):**
```yaml
# This policy is managed by claude0 (turnkey mode).
# Run 'claude0 expert' to unlock for manual editing.
```

**Expert (unlocked):**
```yaml
# ClaudeZero routing policy (expert mode — edit freely)
# Maps step types to Anthropic model tiers: haiku/sonnet/opus/fable
```

When you switch modes, claude0 rewrites the policy header but preserves your routing entries.

### Backward Compatibility

- Repos without `.claude0/mode.json` default to turnkey
- All commands work in both modes (advanced ones just aren't shown in turnkey help)
- No ledger schema changes
- Old policies parse correctly

---

## Summary

| Feature | Turnkey | Expert |
|---------|---------|--------|
| **Commands shown** | 4 basic | All 11 |
| **Policy editing** | Locked | Unlocked |
| **Help text** | Simple | Detailed |
| **Target user** | 90% (beginners) | 10% (power users) |
| **Setup** | One command | One command + optional tuning |

Choose turnkey for simplicity. Choose expert for control. Switch anytime.
