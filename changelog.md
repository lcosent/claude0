# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-07-20

### Fixed (safety)
- **Hooks now fail open.** `intercept` and `compress-output` invoked their async
  bodies without catching rejections, so a malformed payload became an unhandled
  rejection: stack trace on stderr and exit 1, inside a live Claude Code session.
  Verified: `echo null | claude0 compress-output` used to crash, now exits 0.
- **Compression can no longer make context worse.** There was no net-benefit
  check: salience-dense output measured 599 → **999** tokens and was emitted
  anyway, and a 9-byte result was rewritten from 3 to ~42 tokens by the recall
  banner. Compression now runs only above a token floor and only when the exact
  emitted string — banner included — is genuinely smaller.
- **`init` no longer destroys pre-existing hooks.** The object-spread merge
  replaced the whole array for an event, silently deleting a user's own
  `UserPromptSubmit`/`PostToolUse` hooks with no way for `uninstall` to restore
  them. It now appends, and backs up `settings.json` first.
- **`uninstall` no longer loses rules.** With the backup missing it deleted
  `.claude0/` — rules included — and exited 0 reporting success. It now rebuilds
  `CLAUDE.md` from `.claude0/rules/`, and preserves post-init edits as
  `CLAUDE.md.claude0-orphaned` instead of overwriting them.
- **A malformed rule file no longer disables claude0 entirely.** One unparseable
  file threw out through the hook's catch, turning claude0 into a silent no-op
  with no ledger record. `loadRules` now skips and warns per file.
- **Raw tool output is gitignored.** `init` adds `.claude0/outputs/` and
  `.claude0/ledger.jsonl` to `.gitignore`. The output store holds unredacted
  stdout of every compressed command, which was committable by default.

### Fixed (correctness)
- **Honest compression metrics.** The ledger logged the pre-banner token count,
  overstating savings by ~39 tokens per compression; it now records the emitted
  size, and logs declined compressions as `skipped: no net benefit`.
- **`report --global`** read `~/.claude0/.claude0/ledger.jsonl`, a path `init
  --global` never writes, so it always reported an empty ledger.
- **Savings are labeled as estimates.** Counts come from `gpt-tokenizer`
  (cl100k), not Claude's tokenizer; `report` now says so.
- **`findClaudeZeroRoot`** never tested the filesystem root, so a project at `/`
  was invisible.
- **Output store is crash- and concurrency-safe**: temp-file + atomic rename,
  a per-stash byte cap, and a total-directory byte budget alongside the file count.
- **Ledger appends are atomic on Windows too.** `fs.appendFileSync` is emulated
  as seek-then-write there, so concurrent hook processes could interleave or
  clobber lines; writes now use an explicit O_APPEND fd and a single `writeSync`.
- **`init` repairs instead of refusing.** It exited immediately on an existing
  `.claude0/`, so a deleted `policy.yaml` or `ledger.jsonl` could never be
  restored — `upgrade` only handles hooks. It now recreates only what is missing
  and leaves rules, policy, ledger, and mode untouched.
- **`init` refuses to nest.** Running it inside an already-managed repo created a
  shadowing install that silently overrode the parent for everything beneath it.
- **`--global` is no longer silently ignored.** Only `init`, `report`, and
  `uninstall` implement it; the others called `requireClaudeZeroRoot()`, which
  walks upward and so resolved the *global* install as a project from anywhere
  under `$HOME`. Unsupported commands now reject it, and falling back to the
  global install warns.
- **`init --global` writes `mode.json`**, which it previously skipped — making
  `--expert` silently ignored for global installs.

### Added
- **`claude0 upgrade`** reconciles an existing project with the current release:
  registers hooks added since it was initialized and runs pending state
  migrations. Upgrading the npm package cannot edit a project's
  `.claude/settings.json`, so without this a new hook never reached existing
  installs. `claude0 doctor` reports hook and version drift.
- **Install version stamp** (`.claude0/version.json`) written by `init` and
  updated by `upgrade`, with an ordered migration chain — previously nothing
  recorded which version created an install, so no state migration was possible.
- **End-to-end test layer** (`src/m27-test.ts`) exercising the real binary:
  fail-open under seven hostile payloads, the compression net-benefit guarantee,
  hook preservation, and `uninstall`'s CLAUDE.md restore. The CLI dispatch layer
  and the stdin hook wrappers previously had zero coverage.
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
- **Corrected the expert-mode claim.** The readme said expert mode "unlocks"
  `doctor`/`learn`/`bloat`/`compile`; no mode check ever gated them. It surfaces
  them in help and unlocks policy editing.
- **Dropped the "under 1ms" hook-latency claim** — the only enforced gate is the
  150ms CI budget in `src/m19-test.ts`.
- **Renamed the generated guide** `ZIPLINE_README.md` → `CLAUDE0.md`, and removed
  the `/claude0 build` orchestration workflow it documented (never implemented)
  along with its dead `DESIGN.md`/`MILESTONES.md` links. `ZIPLINE_*` env vars are
  now `CLAUDE0_*`, with the old names honored as deprecated aliases. User-visible
  "ClaudeZero" strings are now "claude0" throughout, matching the package, binary,
  and `.claude0/` directory.
- **Tests are hermetic.** Several milestone tests used `process.cwd()` as their
  repo root, so `npm test` truncated and appended to the developer's real
  `.claude0/ledger.jsonl` — gitignored, and therefore unrecoverable.

## [1.0.0] - 2026-07-08

First stable release of claude0.

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
- **Hook overhead**: under a 150ms CI-enforced budget
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
