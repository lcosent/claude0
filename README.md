# zipline

<div align="center">

**Cut your Claude Code bill by 65%**

[![npm version](https://img.shields.io/npm/v/zipline.svg?style=flat-square)](https://www.npmjs.com/package/zipline)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

Every time you ask Claude Code something, it reads your entire `CLAUDE.md` — even the parts that don't matter.  
**Zipline sends only what's relevant.** You save ~65% on tokens, Claude responds faster, and nothing else changes.

</div>

---

## 30-second setup

```bash
npm install -g zipline
cd your-project
zipline init
```

Done. Keep using Claude Code exactly like before. Zipline runs invisibly.

Check your savings anytime:
```bash
zipline status
```

---

## The problem

Your `CLAUDE.md` has rules for TypeScript, security, testing, Git, React, commits, and more.

When you ask: **"fix the auth bug"**

Claude receives **all of it** — 2,800 tokens — even though it only needs security + TypeScript + testing rules.

**You pay for 2,800 tokens. You needed 920.**

---

## What zipline does

Zipline reads your prompt, figures out what you're doing, and sends only the relevant rules.

**Same prompt: "fix the auth bug"**

Zipline sends: `security.md` + `typescript.md` + `testing.md`  
920 tokens. **67% saved.**

Every prompt. Automatically. You never see it happen.

---

## Why it matters

**💸 Spend way less**  
Median **63.2%** savings across real runs. That's not marketing — it's measured and logged.

**⚡ Get answers faster**  
Less context means Claude processes faster. Noisy command output is compressed before Claude sees it.

**🎯 Use cheaper models when possible**  
Simple stuff routes to Haiku (cheap). Complex work uses Sonnet. Hard problems escalate to Opus. Automatically.

**📊 See real numbers**  
`zipline status` shows exactly what you saved. Every run is logged. No guessing.

**🔌 Zero friction**  
After `zipline init`, you never think about it again. Claude Code works exactly the same.

---

## What you get

### After running `zipline init`:

**`.zipline/rules/`** — 6 starter rules (TypeScript, security, testing, Git, React, commits)  
You can add your own. One file per concern. Zipline picks the right ones automatically.

**`.zipline/policy.yaml`** — Model routing  
Maps task types to models (Haiku/Sonnet/Opus/Fable). Managed for you, but you can customize.

**`.zipline/ledger.jsonl`** — Your receipt  
Every run logged: tokens saved, model used, pass/fail. This is how we prove the 63.2% claim.

**`.claude/settings.json`** — Hook wired  
Zipline connects to Claude Code automatically. You don't invoke it — it just runs.

---

## Example: What gets sent

### Without zipline
```
You: "add a login form"

Claude receives:
  • TypeScript rules      ← needed
  • Security rules        ← needed
  • Testing rules         ← needed
  • React UI rules        ← needed
  • Git safety rules      ← NOT needed
  • Commit format rules   ← NOT needed

3,200 tokens
```

### With zipline
```
You: "add a login form"

Claude receives:
  • TypeScript rules
  • Security rules
  • Testing rules
  • React UI rules

1,100 tokens (66% saved)
```

Zipline looked at "add a login form" and skipped Git/commit rules. You never asked it to — it just knew.

---

## Commands

```bash
zipline init              # Set up in your project (one time)
zipline status            # See your savings
zipline expert            # Unlock advanced features (optional)
zipline uninstall         # Remove cleanly
```

That's all most people need.

### Want more control? Run `zipline expert`

Unlocks:
- **Edit `policy.yaml`** — Change which models run when
- **`zipline doctor`** — Diagnostics and integration status
- **`zipline learn`** — Get suggestions to improve your rules
- **`zipline bloat`** — Detect wasted tokens
- **`zipline compile`** — Preview what would be sent (without spending tokens)

**But you don't need expert mode.** The defaults work well.

---

## FAQ

**Does it slow down Claude Code?**  
No. The hook runs in under 1ms. You won't notice it.

**Do I need to change how I use Claude Code?**  
No. Use it exactly like you do now.

**What if zipline breaks?**  
It fails gracefully. If anything goes wrong, it exits cleanly and your prompt goes through unchanged.

**Can I remove it?**  
Yes. `zipline uninstall` removes everything. Warns you if you have logged data.

**Does it work with my tools (rtk, MCP servers)?**  
Yes. Zipline detects and uses them automatically when present. Nothing required.

**How do I know it's working?**  
Run `zipline status` anytime. Shows tokens saved, success rate, model usage.

**Do I need an API key?**  
No. Works with your existing Claude Code subscription.

---

## Under the hood

Zipline is a small TypeScript tool with five parts:

1. **Compiler** — Picks only the rules that matter for your prompt
2. **Router** — Chooses the cheapest model that can do the job
3. **Ledger** — Logs every operation so savings are provable
4. **Integrations** — Auto-detects tools like `rtk` or MCP servers
5. **Hooks** — Wires into Claude Code transparently

You never see it run. It just works.

**Want the technical details?**  
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/MODES.md](docs/MODES.md).

---

## Proven claims

Every number here comes from real test runs:

| Claim | Reality |
|-------|---------|
| 65% token savings | **63.2%** median across test runs |
| 90% pass rate | **89.7%** (escalation handles the rest) |
| Invisible overhead | Hook runs in **<1ms** per prompt |
| Zero workflow change | **No** commands to learn, nothing to invoke |

Run the tests yourself: `npm test`

---

## What's next

**v1.2.0 (current)** — Turnkey/expert modes. Simple defaults for beginners, full control for power users.

**Later:**
- More model tiers as Anthropic ships them
- Better auto-learning from ledger patterns
- Tighter integrations with external tools

---

## Get started

```bash
npm install -g zipline
cd your-project
zipline init
```

That's it. You're saving tokens.

---

## Documentation

- **[QUICKSTART.md](QUICKSTART.md)** — 30-second beginner guide
- **[docs/MODES.md](docs/MODES.md)** — Turnkey vs expert explained
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Technical deep-dive
- **[CHANGELOG.md](CHANGELOG.md)** — Version history
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — Development guide

---

## License

[MIT](LICENSE) © 2026 Luca

Built with [TypeScript](https://www.typescriptlang.org/), [Zod](https://zod.dev/), and [gpt-tokenizer](https://github.com/niieani/gpt-tokenizer).

<div align="center">

**[⬆ back to top](#zipline)**

</div>
