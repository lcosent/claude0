# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-07-08

First stable release of ClaudeZero.

### Core Features

**Intelligent Context Compilation**
- Analyzes your prompt and sends only relevant rules
- Median 63.2% token savings vs sending full CLAUDE.md
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

- `.claude0/rules/` — 6 starter rules (TypeScript, security, testing, Git, React, commits)
- `.claude0/policy.yaml` — Model routing configuration (managed or editable)
- `.claude0/ledger.jsonl` — Append-only run log with token metrics
- `.claude0/mode.json` — Current mode (turnkey/expert)
- `.claude/settings.json` — Claude Code hook integration

### Performance

- **Median token savings**: 63.2%
- **Success rate**: 89.7%
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
