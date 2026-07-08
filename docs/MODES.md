# Turnkey vs Expert Mode

Zipline has two modes: **turnkey** (simple, managed) and **expert** (full control).

---

## Turnkey Mode (Default)

**Who it's for:** People who want "just works" with zero configuration.

### What you get
```bash
zipline init      # One command, fully set up
zipline status    # Simple savings summary
zipline uninstall # Clean removal
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
  zipline init [--expert]         Set up zipline in your project
  zipline status                  Check how much you're saving
  zipline expert                  Unlock advanced features
  zipline uninstall [--force]     Remove zipline
```

**Policy file (`policy.yaml`):**
```yaml
# This policy is managed by zipline (turnkey mode).
# Run 'zipline expert' to unlock for manual editing.

context-compile: haiku
unit-test-write: sonnet
design-synthesis: fable
...
```

**Status output:**
```
Zipline Status
─────────────────────────────────
✓ Saving 65.2% on average
✓ 47 runs, 93.6% success rate
✓ Using mostly Sonnet, rarely Opus

Everything working well.
Run 'zipline expert' for advanced controls.
```

---

## Expert Mode (Opt-in)

**Who it's for:** Power users who want to tune routing, customize policies, and see detailed diagnostics.

### How to enable

**Option 1: During init**
```bash
zipline init --expert
```

**Option 2: Upgrade later**
```bash
zipline expert
```

### What changes

**Unlocked policy:**
```yaml
# Zipline routing policy (expert mode — edit freely)
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
  zipline init [--expert] [--global]     Initialize .zipline/ in current dir
  zipline status                         Simple savings summary
  zipline report [--global]              Detailed token savings metrics
  zipline compile "goal" tags            Preview context compilation
  zipline doctor                         Show integrations + diagnostics
  zipline policy <pull|push>             Sync routing policy across repos
  zipline learn [--apply]                Propose rule improvements
  zipline bloat [--fix] [--dry-run]      Detect context bloat
  zipline turnkey                        Switch back to turnkey mode
  zipline uninstall [--global] [--force] Remove zipline
```

### What you can do

**1. Edit routing policy**
```bash
vim .zipline/policy.yaml
```
Change which model runs for which task type.

**2. Check integrations**
```bash
zipline doctor
```
See what tools are active (rtk, MCP servers, etc.).

**3. Get detailed metrics**
```bash
zipline report
```
Full breakdown: tokens saved per task type, escalation rate, tier mix, regression detection.

**4. Improve rules**
```bash
zipline learn
```
Get suggestions based on what's actually working.

**5. Find waste**
```bash
zipline bloat --fix
```
Auto-detect and fix bloated rules, cache misses, compression issues.

**6. Preview compilations**
```bash
zipline compile "fix auth bug" typescript,security,testing
```
See exactly what would be sent without spending tokens.

---

## Switching Modes

### Turnkey → Expert (Upgrade)
```bash
zipline expert
```

Output:
```
✓ Upgraded to expert mode

Changes:
  • policy.yaml unlocked for manual editing
  • All advanced commands now available
  • Full control over routing and tuning

Next steps:
  zipline doctor     — Check integrations
  zipline report     — Detailed metrics
  zipline --help     — See all commands
```

### Expert → Turnkey (Downgrade)
```bash
zipline turnkey
```

Output:
```
✓ Downgraded to turnkey mode

Changes:
  • policy.yaml locked (managed by zipline)
  • Advanced commands hidden from help
  • Simplified command interface

Run 'zipline status' to check how it's working.
```

---

## How Mode is Stored

File: `.zipline/mode.json`

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
zipline init        # Done. One command.
zipline status      # Check savings occasionally
# Happy with defaults, never switches to expert
```

### Journey 2: Start Simple, Tune Later
```bash
zipline init                # Start in turnkey
# ... weeks go by, wants more control ...
zipline expert              # Unlock features
vim .zipline/policy.yaml    # Customize routing
zipline doctor              # Check what's active
zipline learn               # Get improvement suggestions
```

### Journey 3: Power User from Start
```bash
zipline init --expert       # Skip turnkey, go straight to expert
vim .zipline/policy.yaml    # Customize immediately
zipline doctor              # Check integrations
zipline compile "task" tags # Preview compilations
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
# This policy is managed by zipline (turnkey mode).
# Run 'zipline expert' to unlock for manual editing.
```

**Expert (unlocked):**
```yaml
# Zipline routing policy (expert mode — edit freely)
# Maps step types to Anthropic model tiers: haiku/sonnet/opus/fable
```

When you switch modes, zipline rewrites the policy header but preserves your routing entries.

### Backward Compatibility

- Repos without `.zipline/mode.json` default to turnkey
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
