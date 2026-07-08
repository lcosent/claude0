# Get Started in 30 Seconds

Zipline cuts your Claude Code bill by ~65%. Here's how to set it up.

---

## Install

```bash
npm install -g zipline
```

---

## Set up (one time)

```bash
cd your-project
zipline init
```

You'll see:
```
Zipline initialized in /your/project (turnkey mode)

Created:
  .zipline/rules/        (6 sample rules)
  .zipline/policy.yaml   (routing policy — managed)
  .zipline/mode.json     (turnkey mode)
  .zipline/ledger.jsonl  (empty log)
  .claude/settings.json  (hook configured)

Next: Just use Claude Code normally. Zipline works transparently.
```

**That's the entire setup.** You're done.

---

## Use it (no change)

Keep using Claude Code exactly like before:

```
claude> fix the auth bug
claude> add a login form
claude> refactor the API handler
```

Zipline runs invisibly on every prompt. You won't see it work.

---

## Check your savings

```bash
zipline status
```

```
Zipline Status
─────────────────────────────────
✓ Saving 65.2% on average
✓ 47 runs, 93.6% success rate
✓ Using mostly Sonnet, rarely Opus

Everything working well.
```

That's it. You're saving tokens.

---

## What just happened?

When you ran `zipline init`, it created:

### 1. Six starter rules
- `typescript-style.md` — TypeScript conventions
- `security.md` — Security guidelines
- `testing.md` — Testing practices
- `git-safety.md` — Git safety rules
- `react-ui.md` — React UI patterns
- `commits.md` — Commit message format

### 2. A routing policy
Decides which model to use:
- Simple tasks → Haiku (cheap, fast)
- Normal work → Sonnet (balanced)
- Hard problems → Opus (powerful)

### 3. A hook
Connects to Claude Code so zipline runs automatically on every prompt.

### 4. A log
Every run gets recorded: tokens saved, model used, pass/fail.

---

## How it works

**Without zipline:**
```
You: "fix the auth bug"

Claude receives your ENTIRE CLAUDE.md:
  • TypeScript rules
  • Security rules
  • Testing rules
  • Git rules         ← not needed for this
  • React rules       ← not needed for this
  • Commit rules      ← not needed for this

2,800 tokens
```

**With zipline:**
```
You: "fix the auth bug"

Claude receives only what matters:
  • TypeScript rules
  • Security rules
  • Testing rules

920 tokens (67% saved)
```

Zipline reads your prompt, figures out you're fixing a bug (not working with Git or React), and skips the irrelevant rules.

**You never tell it what to skip. It figures it out.**

---

## What if I want more control?

Run:
```bash
zipline expert
```

This unlocks:
- Editing the routing policy (change which models run when)
- Advanced commands (`doctor`, `learn`, `bloat`, `compile`)
- Full diagnostics

**But most people never need it.** Turnkey mode works great.

---

## Common questions

**Q: Do I need to do anything after `zipline init`?**  
A: No. Just use Claude Code normally.

**Q: Will it break my workflow?**  
A: No. If zipline fails for any reason, it exits cleanly and your prompt goes through unchanged.

**Q: How do I know it's working?**  
A: Run `zipline status` anytime.

**Q: Can I turn it off?**  
A: Yes. `zipline uninstall` removes everything.

**Q: Does it slow things down?**  
A: No. The hook runs in under 1ms. Claude actually responds *faster* because there's less to process.

---

## Next steps

You're done. Go use Claude Code and save tokens.

Want details? See the [full README](README.md).
