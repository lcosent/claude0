# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Reversible tool-output compression.** The `PostToolUse` hook now stashes the
  full original of every compressed output under `.claude0/outputs/` and appends
  a retrieval handle. New `claude0 recall <id>` command prints the original, so
  compression never loses information Claude might need.
- **CLAUDE.md migration on `init`.** An existing `CLAUDE.md` is split into tagged
  rules under `.claude0/rules/` and replaced with a stub, so Claude Code stops
  re-reading the full file every prompt. The original is backed up to
  `.claude0/CLAUDE.md.backup` and restored by `claude0 uninstall`. Sections that
  can't be confidently tagged are marked `always` and injected on every prompt —
  user instructions are never silently dropped.

### Changed
- **Salience-aware output compression.** Verbose output is no longer truncated
  by blindly keeping head + tail. Error, failure, assertion, and stack-frame
  lines are retained wherever they appear, so a failure buried in the middle of
  a long test/build log survives compression.
- **More precise tag inference.** Keyword matching is now word-boundary/prefix
  based instead of raw substring, so `pr`/`ts` no longer mis-tag "project" or
  "tests". This matters most for migration, which tags rule *content*.
- **Honest metrics.** Removed unsubstantiated fixed savings percentages ("65%",
  "63.2%") from the CLI, package metadata, and docs. Savings are computed per run
  from real token counts in `.claude0/ledger.jsonl`; `claude0 report` shows them.

## [1.0.0] - 2026-07-08

First stable release of ClaudeZero.

### Core Features

**Intelligent Context Compilation**
- Analyzes your prompt and sends only relevant rules
- Per-run token savings vs sending full CLAUDE.md, measured and logged
- Silent-drop protection with full rule tracking

**Smart Model Routing**
- Automatic tier selection: Haiku → Sonnet → Opus → Fable
- Policy-based routing with escalation on failures
- Budget circuit-breaker to prevent runaway costs

**Turnkey & Expert Modes**
- **Turnkey mode (default)**: Zero-config setup, managed policy, simple commands
- **Expert mode**: Full control over routing policy, advanced diagnostics, learning

**Integrations**
- Auto-detects and uses `rtk` for accelerated output compression
- TypeScript language service integration for symbol queries
- gstack orchestration suite detection
- MCP server support

**Monitoring & Learning**
- Append-only ledger tracks every run with token metrics
- `claude0 status` shows real savings data
- `claude0 learn` suggests rule improvements from usage patterns
- `claude0 doctor` provides full diagnostic view

### Commands

```bash
claude0 init              # Set up in your project
claude0 status            # See your token savings
claude0 expert            # Unlock advanced features
claude0 uninstall         # Clean removal
```

**Expert mode unlocks:**
- `claude0 doctor` — Full diagnostics
- `claude0 learn` — Rule improvement suggestions  
- `claude0 bloat` — Context bloat detection
- `claude0 compile` — Preview compiled context
- Policy editing in `.claude0/policy.yaml`

### What Gets Created

- `.claude0/rules/` — rules migrated from your CLAUDE.md, or starter rules if none exists
- `.claude0/policy.yaml` — Model routing configuration (managed or editable)
- `.claude0/ledger.jsonl` — Append-only run log with token metrics
- `.claude0/mode.json` — Current mode (turnkey/expert)
- `.claude/settings.json` — Claude Code hook integration

### Performance

- **Token savings**: measured per run and logged to the ledger (`claude0 report`)
- **Hook overhead**: <1ms
- **Context bloat protection**: Automatic detection and prevention

Run tests: `npm test`

---

---

## Security

See [security.md](security.md) for vulnerability reporting.

---

<div align="center">

**[⬆ back to top](#changelog)**

</div>
