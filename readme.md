<div align="center">

# 🥤 claude0

**Cut Claude Code token usage — automatically**

Every time you ask Claude Code something, it reads your entire `CLAUDE.md` — even the parts that don't matter, and every verbose command dumps its full output into the context.  
**claude0 sends only the relevant rules and compresses tool output before it reaches the model** — reversibly, so nothing is ever lost. Your actual savings are measured per run and logged to `.claude0/ledger.jsonl`; run `claude0 report` to see yours.

<br/>

[![npm version](https://img.shields.io/npm/v/claude0?style=flat-square&color=blue)](https://www.npmjs.com/package/claude0)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)

<br/>

**[Get Started →](#-get-started)** · **[Documentation](quickstart.md)** · **[Architecture](docs/ARCHITECTURE.md)**

<br/>

</div>

---

## 🚀 Get started

```bash
npm install -g claude0      # 1. Install globally
cd your-project             # 2. Go to your project
claude0 init                # 3. Set up once
```

✨ **Done.** Keep using Claude Code exactly like before. claude0 runs invisibly.

```bash
claude0 status              # Check your savings anytime
```

<br/>

<div align="center">

**[⭐️ Star this repo](https://github.com/lcosent/claude0)** · **[Share on Twitter](https://twitter.com/intent/tweet?text=Cut%20Claude%20Code%20token%20usage%20automatically%20with%20claude0&url=https://github.com/lcosent/claude0)**

</div>

---

## 🎯 One problem. One solution.

<table>
<tr>
<td width="50%">

### ❌ Without claude0

Your `CLAUDE.md` has rules for TypeScript, security, testing, Git, React, commits, and more.

**Prompt:** "fix the auth bug"

Claude receives:
- ✓ TypeScript rules
- ✓ Security rules
- ✓ Testing rules
- ⚠️ Git rules (not needed)
- ⚠️ React rules (not needed)
- ⚠️ Commit rules (not needed)

**2,800 tokens**

</td>
<td width="50%">

### ✅ With claude0

claude0 reads your prompt, figures out what you're doing, and sends only relevant rules.

**Same prompt:** "fix the auth bug"

Claude receives:
- ✓ TypeScript rules
- ✓ Security rules
- ✓ Testing rules

<br/>
<br/>
<br/>

**920 tokens** *(illustrative — your real numbers are in the ledger)*

</td>
</tr>
</table>

Every prompt. Automatically. You never see it happen. And whatever the compiler and the tool-output compressor actually save is written to `.claude0/ledger.jsonl` — the savings are falsifiable, not marketing.

---

## ✨ Why it matters

**💸 Spend less** — Only the relevant rules are sent, and verbose tool output is compressed before it reaches the model. Your real per-run savings are measured and logged — no headline number to take on faith.

**↩️ Nothing lost** — Compression is reversible: the full original of every compressed output is stashed, and Claude can pull it back with `claude0 recall <id>` whenever it needs the detail.

**⚡️ Get answers faster** — Less context means Claude processes faster.

**🎯 Smart routing** — Simple → Haiku. Complex → Sonnet. Hard → Opus. Automatically.

**🛡️ Context bloat protection** — Detects and prevents wasteful context growth before it costs you.

**📊 See real numbers** — `claude0 status` and `claude0 report` show exactly what you saved, straight from the ledger.

**🔌 Zero friction** — After `claude0 init`, you never think about it again. `claude0 uninstall` restores your original `CLAUDE.md`.

---

## 📝 Example: What gets sent

### Without claude0
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

### With claude0
```
You: "add a login form"

Claude receives:
  • TypeScript rules
  • Security rules
  • Testing rules
  • React UI rules

1,100 tokens   ← illustrative; your real numbers are in the ledger
```

claude0 looked at "add a login form" and skipped Git/commit rules. You never asked it to — it just knew. (Numbers above are illustrative — run `claude0 report` for your actual savings.)

---

## 🛠️ Commands

```bash
claude0 init              # Set up in your project (migrates your CLAUDE.md)
claude0 status            # See your savings
claude0 report            # Detailed metrics from the ledger
claude0 recall <id>       # Get the full original of a compressed tool output
claude0 upgrade           # Register hooks added since this project was set up
claude0 expert            # Unlock advanced features (optional)
claude0 turnkey           # Go back to managed mode
claude0 uninstall         # Remove cleanly (restores your CLAUDE.md)
```

### Updating

```bash
npm install -g claude0@latest   # update the package
claude0 upgrade                 # then, in each initialized project
```

Upgrading the package swaps the binary, but it cannot edit a project's
`.claude/settings.json`. When a release adds a hook, existing projects keep
running without it until `claude0 upgrade` registers it — `claude0 doctor`
reports which hooks are missing.

Expert mode surfaces `doctor`, `learn`, `bloat`, and `compile` in the help output
and unlocks policy editing. The commands themselves run in either mode.

---

## 📊 How it works

**At `init`** — your `CLAUDE.md` is split into tagged rules under `.claude0/rules/`, then replaced with a small stub (original backed up). Claude Code stops re-reading the full rule set on every prompt. Sections that can't be confidently tagged are marked `always` so they're never dropped — they just always load.

**On every prompt** —
1. **Analyze** — claude0 reads your prompt and infers the intent (plus any `always` rules)
2. **Filter** — Only the matching rules are injected, not the whole file
3. **Compress** — Verbose tool output (test runs, build logs) is shrunk before it reaches the model, keeping error/failure lines and stashing the full original for `claude0 recall`
4. **Track** — Every operation logs real token counts to `.claude0/ledger.jsonl`
5. **Route** — The cheapest model tier that can pass the step is chosen

See [Architecture](docs/ARCHITECTURE.md) for technical details.

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](contributing.md) for guidelines.

- Report bugs via [GitHub Issues](https://github.com/lcosent/claude0/issues)
- Join discussions at [GitHub Discussions](https://github.com/lcosent/claude0/discussions)
- Read the [security policy](security.md) for reporting vulnerabilities

---

<div align="center">

**[⭐️ Star this repo](https://github.com/lcosent/claude0)** · **[Share on Twitter](https://twitter.com/intent/tweet?text=Cut%20Claude%20Code%20token%20usage%20automatically%20with%20claude0&url=https://github.com/lcosent/claude0)**

**[Quickstart](quickstart.md)** · **[Issues](https://github.com/lcosent/claude0/issues)** · **[Discussions](https://github.com/lcosent/claude0/discussions)** · **[Contributing](contributing.md)**

<sub>Built with [TypeScript](https://www.typescriptlang.org/), [Zod](https://zod.dev/), and [gpt-tokenizer](https://github.com/niieani/gpt-tokenizer)</sub>

**[MIT License](license.txt)** © 2026 Luca

</div>
