<div align="center">

# 🥤 claude0
### ClaudeZero

### Cut your Claude Code bill by 65%

Every time you ask Claude Code something, it reads your entire `CLAUDE.md` — even the parts that don't matter.  
**ClaudeZero sends only what's relevant.** You save ~65% on tokens, Claude responds faster, and nothing else changes.

<br/>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

<br/>

**[Get Started →](#get-started)** · **[Documentation](quickstart.md)**

<br/>

</div>

---

<div align="center">

## Get started

</div>

```bash
npm install -g claude0      # 1. Install globally
cd your-project             # 2. Go to your project
claude0 init                # 3. Set up once
```

✨ **Done.** Keep using Claude Code exactly like before. ClaudeZero runs invisibly.

```bash
claude0 status              # Check your savings anytime
```

<div align="center">

**[⭐️ Star this repo](https://github.com/lcosent/claude0)** · **[Share on Twitter](https://twitter.com/intent/tweet?text=Cut%20my%20Claude%20Code%20bill%20by%2065%25%20with%20ClaudeZero&url=https://github.com/lcosent/claude0)**

</div>

---

<div align="center">

## One problem. One solution.

</div>

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

ClaudeZero reads your prompt, figures out what you're doing, and sends only relevant rules.

**Same prompt:** "fix the auth bug"

Claude receives:
- ✓ TypeScript rules
- ✓ Security rules
- ✓ Testing rules

<br/>
<br/>
<br/>

**920 tokens** (67% saved)

</td>
</tr>
</table>

Every prompt. Automatically. You never see it happen.

---

## Why it matters

**💸 Spend way less** — Median 63.2% savings across real runs. Measured and logged.

**⚡️ Get answers faster** — Less context means Claude processes faster. Compressed output too.

**🎯 Smart routing** — Simple → Haiku. Complex → Sonnet. Hard → Opus. Automatically.

**🛡️ Context bloat protection** — Detects and prevents wasteful context growth before it costs you.

**📊 See real numbers** — `claude0 status` shows exactly what you saved. No guessing.

**🔌 Zero friction** — After `claude0 init`, you never think about it again.

---

## Example: What gets sent

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

1,100 tokens (66% saved)
```

ClaudeZero looked at "add a login form" and skipped Git/commit rules. You never asked it to — it just knew.

---

## Commands

```bash
claude0 init              # Set up in your project (one time)
claude0 status            # See your savings
claude0 expert            # Unlock advanced features (optional)
claude0 uninstall         # Remove cleanly
```

Expert mode unlocks: `doctor`, `learn`, `bloat`, `compile`, and policy editing.


---

---

<div align="center">

**[⭐️ Star this repo](https://github.com/lcosent/claude0)** · **[Share on Twitter](https://twitter.com/intent/tweet?text=Cut%20my%20Claude%20Code%20bill%20by%2065%25%20with%20ClaudeZero&url=https://github.com/lcosent/claude0)**

**[Quickstart](quickstart.md)** · **[Issues](https://github.com/lcosent/claude0/issues)** · **[Discussions](https://github.com/lcosent/claude0/discussions)** · **[Contributing](contributing.md)**

<sub>Built with [TypeScript](https://www.typescriptlang.org/), [Zod](https://zod.dev/), and [gpt-tokenizer](https://github.com/niieani/gpt-tokenizer)</sub>

**[MIT License](license.txt)** © 2026 Luca

</div>
