<div align="center">

# ⚡️ Quick Start

### Set up claude0 in 30 seconds

Cut your Claude Code bill by 65%. No workflow changes.

<br/>

</div>

---

## Install

```bash
npm install -g claude0
```

---

## Set up (one time)

```bash
cd your-project
claude0 init
```

You'll see:
```
ClaudeZero initialized in /your/project (turnkey mode)

Created:
  .claude0/rules/        (6 sample rules)
  .claude0/policy.yaml   (routing policy — managed)
  .claude0/mode.json     (turnkey mode)
  .claude0/ledger.jsonl  (empty log)
  .claude/settings.json  (hook configured)

Next: Just use Claude Code normally. ClaudeZero works transparently.
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

ClaudeZero runs invisibly on every prompt. You won't see it work.

---

## Check your savings

```bash
claude0 status
```

```
ClaudeZero Status
─────────────────────────────────
✓ Saving 65.2% on average
✓ 47 runs, 93.6% success rate
✓ Using mostly Sonnet, rarely Opus

Everything working well.
```

That's it. You're saving tokens.

---

## What just happened?

When you ran `claude0 init`, it created:

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
Connects to Claude Code so claude0 runs automatically on every prompt.

### 4. A log
Every run gets recorded: tokens saved, model used, pass/fail.

---

## How it works

**Without claude0:**
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

**With claude0:**
```
You: "fix the auth bug"

Claude receives only what matters:
  • TypeScript rules
  • Security rules
  • Testing rules

920 tokens (67% saved)
```

ClaudeZero reads your prompt, figures out you're fixing a bug (not working with Git or React), and skips the irrelevant rules.

**You never tell it what to skip. It figures it out.**

---

## What if I want more control?

Run:
```bash
claude0 expert
```

This unlocks:
- Editing the routing policy (change which models run when)
- Advanced commands (`doctor`, `learn`, `bloat`, `compile`)
- Full diagnostics

**But most people never need it.** Turnkey mode works great.

---

## Common questions

**Q: Do I need to do anything after `claude0 init`?**  
A: No. Just use Claude Code normally.

**Q: Will it break my workflow?**  
A: No. If claude0 fails for any reason, it exits cleanly and your prompt goes through unchanged.

**Q: How do I know it's working?**  
A: Run `claude0 status` anytime.

**Q: Can I turn it off?**  
A: Yes. `claude0 uninstall` removes everything.

**Q: Does it slow things down?**  
A: No. The hook runs in under 1ms. Claude actually responds *faster* because there's less to process.

---

<div align="center">

## You're all set

Go use Claude Code and save tokens.

<br/>

**[Read full docs](readme.md)** · **[⭐️ Star this repo](https://github.com/lcosent/claude0)** · **[Share](https://twitter.com/intent/tweet?text=Cut%20my%20Claude%20Code%20bill%20by%2065%25%20with%20ClaudeZero&url=https://github.com/lcosent/claude0)**

</div>
