# Documentation Visibility Strategy

This document explains which files are visible where.

## Three Audiences

1. **NPM users** — `npm install zipline` (most users, want essentials only)
2. **GitHub visitors** — Browse github.com/lcosent/zipline (evaluating, exploring)
3. **Contributors** — Clone repo, want to contribute (need full context)

## What Goes Where

### NPM Package (via `package.json` "files" field)
**Audience:** End users installing via npm

✅ **Included:**
- `dist/` — Compiled code
- `docs/` — User-facing documentation
- `README.md` — Main landing page
- `QUICKSTART.md` — Beginner guide
- `CHANGELOG.md` — Version history
- `CONTRIBUTING.md` — How to contribute
- `SECURITY.md` — Vulnerability reporting
- `LICENSE` — MIT license

❌ **Excluded (via .npmignore):**
- `src/` — Source code (dist/ has compiled version)
- `BACKLOG.md` — Your TODO list
- `DESIGN.md` — Internal design decisions
- `IMPLEMENTATION.md` — Implementation notes
- `MILESTONES.md` — Milestone tracking
- `M*_SUMMARY.md` — Milestone summaries
- `GITHUB_READY.md` — Pre-publish checklist
- `GITHUB_SETUP.md` — GitHub setup instructions
- `TURNKEY_EXPERT_SUMMARY.md` — Implementation reference
- `tsconfig.json`, `.gitignore`, `.github/` — Dev config

### GitHub Repository (what's committed to git)
**Audience:** Anyone browsing or cloning the repo

✅ **Included (all files):**
- Everything in NPM package
- **Plus** internal development docs:
  - `BACKLOG.md` — Current TODO list
  - `DESIGN.md` — Architecture decisions and risks
  - `IMPLEMENTATION.md` — Implementation status
  - `MILESTONES.md` — Success criteria per milestone
  - `M24_SUMMARY.md` (and similar) — Milestone summaries
  - `GITHUB_READY.md` — Pre-publish checklist
  - `GITHUB_SETUP.md` — Repository setup guide
  - `TURNKEY_EXPERT_SUMMARY.md` — v1.2.0 implementation reference
  - `src/` — TypeScript source code
  - Development config files

**Why include internal docs in git?**
- Contributors reference them (see CONTRIBUTING.md)
- Shows the development methodology
- Provides context for design decisions
- Milestone tracking helps future contributors

❌ **Excluded (via .gitignore):**
- `node_modules/` — Dependencies
- `dist/` — Build artifacts (rebuilt on npm prepublish)
- `.zipline/ledger.jsonl` — Test run data
- IDE files, logs, temp files

## User-Facing Documentation

### For Absolute Beginners
1. **QUICKSTART.md** — 30-second setup, zero jargon
2. **README.md** → "Get started" section

### For Regular Users
1. **README.md** — Main reference, features, examples
2. **docs/MODES.md** — Turnkey vs expert mode
3. **CHANGELOG.md** — What changed in each version

### For Power Users / Experts
1. **docs/ARCHITECTURE.md** — Technical deep-dive
2. **docs/MODES.md** — Mode design details
3. **CONTRIBUTING.md** — How to extend/modify

## Internal Documentation

### For You (Maintainer)
1. **BACKLOG.md** — What's next
2. **MILESTONES.md** — Success criteria
3. **GITHUB_READY.md** — Pre-publish checklist

### For Contributors
1. **DESIGN.md** — Why things work this way
2. **IMPLEMENTATION.md** — What's been built
3. **CONTRIBUTING.md** — How to contribute
4. **M*_SUMMARY.md** — Milestone implementation notes

## Summary

```
┌─────────────────┐
│  NPM Package    │  Essentials only (README, QUICKSTART, docs/, dist/)
│  (npm install)  │  What users need to use zipline
└─────────────────┘

┌─────────────────┐
│  GitHub Repo    │  Everything (user docs + internal docs + source)
│  (git clone)    │  Full transparency for contributors
└─────────────────┘
```

**Key principle:** 
- NPM users get **exactly what they need** (no clutter)
- GitHub visitors get **full transparency** (see the process)
- Contributors get **complete context** (understand decisions)

This is enforced by:
- `package.json` "files" field (whitelist for npm)
- `.npmignore` (exclude internal docs from npm)
- `.gitignore` (exclude build artifacts from git)
