<div align="center">

# ⚡️ zipline

### Cut your Claude Code bill by 65%

Every time you ask Claude Code something, it reads your entire `CLAUDE.md` — even the parts that don't matter.  
**Zipline sends only what's relevant.** You save ~65% on tokens, Claude responds faster, and nothing else changes.

<br/>

[![npm version](https://img.shields.io/npm/v/zipline.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/zipline)
[![Downloads](https://img.shields.io/npm/dm/zipline.svg?style=flat-square&color=green)](https://www.npmjs.com/package/zipline)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

<br/>

**[Get Started →](#at-a-glance)** · **[Why Zipline?](#why-it-matters)** · **[Documentation](QUICKSTART.md)**

<br/>

</div>

---

<div align="center">

## At a glance

</div>

```bash
npm install -g zipline      # 1. Install globally
cd your-project             # 2. Go to your project
zipline init                # 3. Set up once
```

✨ **Done.** Keep using Claude Code exactly like before. Zipline runs invisibly.

<details>
<summary><strong>Check your savings anytime</strong></summary>

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

</details>

---

<div align="center">

## One problem. One solution.

</div>

<table>
<tr>
<td width="50%">

### ❌ Without zipline

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

### ✅ With zipline

Zipline reads your prompt, figures out what you're doing, and sends only relevant rules.

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

<table>
<tr>
<td width="33%" align="center">
<h3>💸 Spend way less</h3>
<p>Median <strong>63.2%</strong> savings across real runs. Measured and logged.</p>
</td>
<td width="33%" align="center">
<h3>⚡️ Get answers faster</h3>
<p>Less context means Claude processes faster. Compressed output too.</p>
</td>
<td width="33%" align="center">
<h3>🎯 Smart routing</h3>
<p>Simple → Haiku. Complex → Sonnet. Hard → Opus. Automatically.</p>
</td>
</tr>
<tr>
<td width="50%" align="center">
<h3>📊 See real numbers</h3>
<p><code>zipline status</code> shows exactly what you saved. No guessing.</p>
</td>
<td width="50%" align="center">
<h3>🔌 Zero friction</h3>
<p>After <code>zipline init</code>, you never think about it again.</p>
</td>
</tr>
</table>

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

<div align="center">

## Simple by default. Powerful when you need it.

</div>

### Core commands

```bash
zipline init              # Set up in your project (one time)
zipline status            # See your savings
```

That's all most people need.

### Expert mode (optional)

```bash
zipline expert            # Unlock advanced features
```

Unlocks:
- **Edit `policy.yaml`** — Change which models run when
- **`zipline doctor`** — Diagnostics and integration status
- **`zipline learn`** — Get suggestions to improve your rules
- **`zipline bloat`** — Detect wasted tokens
- **`zipline compile`** — Preview what would be sent (without spending tokens)
- **`zipline uninstall`** — Remove cleanly

**But you don't need expert mode.** The defaults work well.

---

<div align="center">

## Questions?

</div>

<details>
<summary><strong>Does it slow down Claude Code?</strong></summary>
<br/>
No. The hook runs in under 1ms. You won't notice it. Claude actually responds faster because there's less context to process.
</details>

<details>
<summary><strong>Do I need to change how I use Claude Code?</strong></summary>
<br/>
No. Use it exactly like you do now. Zipline works transparently.
</details>

<details>
<summary><strong>What if zipline breaks?</strong></summary>
<br/>
It fails gracefully. If anything goes wrong, it exits cleanly and your prompt goes through unchanged.
</details>

<details>
<summary><strong>Can I remove it?</strong></summary>
<br/>
Yes. <code>zipline uninstall</code> removes everything. Warns you if you have logged data.
</details>

<details>
<summary><strong>Does it work with my tools (rtk, MCP servers)?</strong></summary>
<br/>
Yes. Zipline detects and uses them automatically when present. Nothing required.
</details>

<details>
<summary><strong>How do I know it's working?</strong></summary>
<br/>
Run <code>zipline status</code> anytime. Shows tokens saved, success rate, model usage.
</details>

<details>
<summary><strong>Do I need an API key?</strong></summary>
<br/>
No. Works with your existing Claude Code subscription.
</details>

---

<div align="center">

**Ready to save 65%?**

**[Get Started →](#at-a-glance)**

</div>

---

## Under the hood

Zipline is a small TypeScript tool with five parts:

1. **Compiler** — Picks only the rules that matter for your prompt
2. **Router** — Chooses the cheapest model that can do the job
3. **Ledger** — Logs every operation so savings are provable
4. **Integrations** — Auto-detects tools like `rtk` or MCP servers
5. **Hooks** — Wires into Claude Code transparently

You never see it run. It just works.

<details>
<summary><strong>Want the technical details?</strong></summary>
<br/>

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — System design and implementation
- **[docs/MODES.md](docs/MODES.md)** — Turnkey vs expert mode internals
- **[src/](src/)** — Full TypeScript source

</details>

---

<div align="center">

## Proven performance

Every number backed by real test runs

</div>

<table>
<tr>
<td width="25%" align="center">
<h3>63.2%</h3>
<p>Median token savings</p>
</td>
<td width="25%" align="center">
<h3>89.7%</h3>
<p>Success rate</p>
</td>
<td width="25%" align="center">
<h3>&lt;1ms</h3>
<p>Hook overhead</p>
</td>
<td width="25%" align="center">
<h3>0</h3>
<p>Commands to learn</p>
</td>
</tr>
</table>

<div align="center">

Run the tests yourself: `npm test`

**[⭐️ Star if this helps you](https://github.com/lcosent/zipline)**

</div>

---

<div align="center">

## What's next

</div>

**v1.2.0 (current)** — Turnkey/expert modes. Simple defaults for beginners, full control for power users.

### Roadmap

- More model tiers as Anthropic ships them
- Better auto-learning from ledger patterns
- Tighter integrations with external tools

**[View full roadmap →](https://github.com/lcosent/zipline/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement)**

---

## Get started

```bash
npm install -g zipline
cd your-project
zipline init
```

That's it. You're saving tokens.

<div align="center">

### Love zipline?

**[⭐️ Star this repo](https://github.com/lcosent/zipline)** · **[Share on Twitter](https://twitter.com/intent/tweet?text=Cut%20my%20Claude%20Code%20bill%20by%2065%25%20with%20zipline&url=https://github.com/lcosent/zipline)**

</div>

---

## Documentation

- **[QUICKSTART.md](QUICKSTART.md)** — 30-second beginner guide
- **[docs/MODES.md](docs/MODES.md)** — Turnkey vs expert explained
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Technical deep-dive
- **[CHANGELOG.md](CHANGELOG.md)** — Version history
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — Development guide

---

<div align="center">

## Join the community

**[Issues](https://github.com/lcosent/zipline/issues)** · **[Discussions](https://github.com/lcosent/zipline/discussions)** · **[Contributing](CONTRIBUTING.md)**

<br/>

<sub>Built with [TypeScript](https://www.typescriptlang.org/), [Zod](https://zod.dev/), and [gpt-tokenizer](https://github.com/niieani/gpt-tokenizer)</sub>

<br/>

**[MIT License](LICENSE)** © 2026 Luca

**[⬆ back to top](#-zipline)**

</div>
