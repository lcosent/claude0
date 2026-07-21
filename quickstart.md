<div align="center">

# ⚡️ Quick Start

### Set up claude0 in 30 seconds

Cut Claude Code token usage — automatically. No workflow changes.

<br/>

</div>

---

## Install

```bash
npm install -g claude0
```

To update later:

```bash
npm install -g claude0@latest
claude0 upgrade   # in each initialized project — registers newly added hooks
```

---

## Set up (one time)

```bash
cd your-project
claude0 init
```

You'll see (when you already have a `CLAUDE.md`):
```
claude0 initialized in /your/project (turnkey mode)

Created:
  .claude0/rules/        (5 rules migrated from CLAUDE.md)
  .claude0/CLAUDE.md.backup  (your original — restored on uninstall)
  CLAUDE.md              (stubbed; full rules now load per-prompt)
  .claude0/policy.yaml   (routing policy — managed)
  .claude0/mode.json     (turnkey mode)
  .claude0/ledger.jsonl  (empty log)
  .claude/settings.json  (hook configured)

Next: Just use Claude Code normally. claude0 works transparently.
```

Your `CLAUDE.md` is split into tagged rules and replaced with a small stub, so Claude Code no longer reads the whole file every prompt. The original is backed up and restored if you ever `claude0 uninstall`. (No `CLAUDE.md` yet? `init` seeds a few starter rules instead.)

**That's the entire setup.** You're done.

---

## Use it (no change)

Keep using Claude Code exactly like before:

```
claude> fix the auth bug
claude> add a login form
claude> refactor the API handler
```

claude0 runs invisibly on every prompt. You won't see it work.

---

## Check your savings

```bash
claude0 status
```

```
claude0 Status
─────────────────────────────────
✓ Saving 41.8% on average          ← your real number, from the ledger
✓ 47 runs, 93.6% success rate
✓ Using mostly Sonnet, rarely Opus

Everything working well.
```

The percentage is computed from `.claude0/ledger.jsonl` — real token counts for your runs, not a marketing figure. Run `claude0 report` for the full per-milestone breakdown.

---

## What just happened?

When you ran `claude0 init`, it:

### 1. Migrated your CLAUDE.md into tagged rules
Each section of your `CLAUDE.md` becomes a rule under `.claude0/rules/`, tagged by
topic (typescript, security, testing, git, …). Sections it can't confidently tag
are marked `always` and load on every prompt — nothing is ever silently dropped.
Your original is backed up; the file itself is stubbed so it no longer loads in
full each turn. (No `CLAUDE.md`? A few starter rules are seeded instead.)

### 2. A routing policy
Decides which model to use:
- Simple tasks → Haiku (cheap, fast)
- Normal work → Sonnet (balanced)
- Hard problems → Opus (powerful)

### 3. Two hooks
- **UserPromptSubmit** — injects only the relevant rules for each prompt
- **PostToolUse** — compresses verbose command output before it reaches the model, keeping error/failure lines and stashing the full original for `claude0 recall <id>`

### 4. A log
Every run gets recorded to `.claude0/ledger.jsonl`: real tokens in vs baseline, model used, pass/fail.

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

920 tokens   ← illustrative; your real numbers are in the ledger
```

claude0 reads your prompt, figures out you're fixing a bug (not working with Git or React), and skips the irrelevant rules.

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
A: Yes. `claude0 uninstall` removes everything and restores your original `CLAUDE.md` from the backup.

**Q: What happens to my CLAUDE.md?**  
A: `init` splits it into tagged rules and replaces it with a small stub, so Claude Code stops re-reading the whole file on every prompt. Your original is saved to `.claude0/CLAUDE.md.backup` and restored on uninstall.

**Q: Does compressing tool output lose information?**  
A: No — it's reversible. Compression keeps error and failure lines and stashes the full original; if Claude needs the untrimmed output it runs `claude0 recall <id>` (the id is printed in the compressed view).

**Q: Does it slow things down?**  
A: The hooks run under a 150ms budget that CI enforces on every commit (see `src/m19-test.ts`);
in practice they land well below it. Claude also has less to process, which offsets the hook cost.

---

<div align="center">

## You're all set

Go use Claude Code and save tokens.

<br/>

**[Read full docs](readme.md)** · **[⭐️ Star this repo](https://github.com/lcosent/claude0)** · **[Share](https://twitter.com/intent/tweet?text=Cut%20Claude%20Code%20token%20usage%20automatically%20with%20claude0&url=https://github.com/lcosent/claude0)**

</div>
