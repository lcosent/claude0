# ClaudeZero Architecture

How the pieces fit: the five-component spine, the integrations layer, and the
per-repo state directory. All diagrams are Mermaid (GitHub renders them natively).

## System overview

The spine owns routing, context compilation, and the ledger. Integrations are
native capabilities that auto-select per step; external tools are accelerators,
never hard dependencies. `.claude0/` is per-repo state, like `.git/`.

```mermaid
flowchart TB
    subgraph spine["claude0 spine (TypeScript)"]
        COMPILER["COMPILER<br/>goal + tags → minimal bundle"]
        ROUTER["ROUTER<br/>step → Haiku/Sonnet/Opus"]
        CONTRACTS["CONTRACTS<br/>Zod I/O + repair retry"]
        LOOP["LOOP<br/>design→plan→gate→build→verify"]
        LEDGER["LEDGER<br/>append-only JSONL"]
    end

    subgraph integ["integrations (auto-selected, no user choice)"]
        direction LR
        SYM["symbol-query<br/>TS Language Service"]
        DOC["doc-fetch<br/>node_modules reader"]
        CMP["output-compress<br/>filter/dedupe/truncate"]
        TERSE["terse-output<br/>prompt fragment"]
        DLOG["decision-log<br/>append-only"]
    end

    subgraph state[".claude0/ (per-repo, like .git/)"]
        RULES["rules/*.md<br/>tagged concerns"]
        POLICY["policy.yaml<br/>step → tier"]
        LEDGERFILE["ledger.jsonl<br/>every op logged"]
    end

    subgraph ext["external tools (optional accelerators / detected only)"]
        RTK["rtk binary<br/>(PATH accelerator)"]
        MCP["Context7 / LSP-MCP<br/>(detected, user-wired)"]
    end

    COMPILER --> RULES
    ROUTER --> POLICY
    LEDGER --> LEDGERFILE
    COMPILER -.enrich.-> SYM & DOC
    ROUTER -.apply.-> TERSE
    LOOP -.compress.-> CMP
    LOOP -.record.-> DLOG
    CMP -.accelerate.-> RTK
    SYM -.detect only.-> MCP
    DOC -.detect only.-> MCP
    integ --> LEDGER

    classDef spineCls fill:#1e3a5f,stroke:#4a90d9,color:#fff
    classDef integCls fill:#2d4a2d,stroke:#5cb85c,color:#fff
    classDef stateCls fill:#4a3a1e,stroke:#d9a94a,color:#fff
    classDef extCls fill:#3a2d3a,stroke:#a05ca0,color:#fff
    class COMPILER,ROUTER,CONTRACTS,LOOP,LEDGER spineCls
    class SYM,DOC,CMP,TERSE,DLOG integCls
    class RULES,POLICY,LEDGERFILE stateCls
    class RTK,MCP extCls
```

## Request data flow — the intercept pipe

This is only honest because `init` first **migrates** the project's `CLAUDE.md`
into tagged rules under `.claude0/rules/` and replaces the file with a stub — so
Claude Code no longer loads the full rule set every turn, and the compiler's
`baseline_tokens` reflects the user's real content rather than something claude0
invented. Sections that match no keyword are tagged `always` and injected on
every prompt, so nothing is silently dropped. The original is backed up and
restored on `uninstall`.

When Claude Code submits a prompt, the `UserPromptSubmit` hook calls
`claude0 intercept`. ClaudeZero compiles minimal context (the matched rules plus
any `always` rules), injects it back, and logs the real input-side token cost. A
non-claude0 repo or any failure exits cleanly without disturbing the prompt.

```mermaid
sequenceDiagram
    participant User
    participant CC as Claude Code
    participant Hook as claude0 intercept
    participant Comp as COMPILER
    participant Led as LEDGER

    User->>CC: submit prompt
    CC->>Hook: UserPromptSubmit {prompt, cwd} (stdin JSON)
    Hook->>Hook: findClaudeZeroRoot(cwd)
    alt not a claude0 repo
        Hook-->>CC: exit 0 (inject nothing)
    else claude0 repo
        Hook->>Hook: inferTags(prompt) → [security, typescript, ...]
        Hook->>Comp: compile(prompt, tags + always)
        Comp-->>Hook: bundle (matched rules + always rules)
        Hook->>Led: log tokens_in vs baseline_tokens (real)
        Hook-->>CC: additionalContext (compiled rules)
        CC->>User: response with minimal context
    end
```

## Reversible output compression — the PostToolUse pipe

A second hook, `PostToolUse`, runs `claude0 compress-output` on verbose tool
results before they reach the model. Compression is **salience-aware** (error,
failure, assertion, and stack-frame lines are kept wherever they appear) and
**reversible**: the full original is stashed under `.claude0/outputs/<id>.txt`
and the compressed view carries a `claude0 recall <id>` handle. The model gets a
small view by default and can pull the untrimmed original on demand — so shrinking
output never costs information.

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant Hook as claude0 compress-output
    participant Store as .claude0/outputs/
    participant Led as LEDGER

    CC->>Hook: PostToolUse {tool_response.stdout} (stdin JSON)
    Hook->>Hook: compressNative (filter → dedupe → salience-elide)
    alt output shrank
        Hook->>Store: stash original → id
        Hook->>Led: log tokens_before vs tokens_after (real)
        Hook-->>CC: updatedToolOutput = compressed + "recall id"
    else nothing to gain
        Hook-->>CC: exit 0 (leave output untouched)
    end
```

Later, `claude0 recall <id>` reads the stashed file back verbatim (ids are
content hashes, validated to stay inside the outputs dir; oldest are pruned).

## Capability selection — automatic, per-repo aware

Capabilities are chosen by step tags and gated by per-repo availability. A
TS-only capability (symbol-query) degrades to "inactive here" in a Python repo
rather than erroring. `claude0 doctor` shows the resulting status.

```mermaid
flowchart TD
    START["step with tags<br/>e.g. [typescript, security]"] --> DETECT{"detectRepoEnv()<br/>cached RepoEnv"}
    DETECT --> SELECT["selectCapabilities(tags, env)"]

    SELECT --> Q1{"tag match?"}
    Q1 -->|no| SKIP["not selected"]
    Q1 -->|yes| Q2{"available<br/>in THIS repo?"}

    Q2 -->|"inactive<br/>(e.g. no tsconfig)"| DEGRADE["passthrough<br/>doctor: 'inactive here'"]
    Q2 -->|"disabled<br/>(net-negative)"| DISABLED["passthrough<br/>doctor: 'disabled'"]
    Q2 -->|yes| Q3{"accelerator<br/>on PATH?"}

    Q3 -->|"rtk present"| ACCEL["run native + accelerator<br/>doctor: 'accelerated'"]
    Q3 -->|no| NATIVE["run native baseline<br/>doctor: 'native'"]

    ACCEL --> LOG["log net-delta<br/>(decision-log exempt)"]
    NATIVE --> LOG

    classDef q fill:#1e3a5f,stroke:#4a90d9,color:#fff
    classDef run fill:#2d4a2d,stroke:#5cb85c,color:#fff
    classDef off fill:#4a2d2d,stroke:#d95c5c,color:#fff
    class Q1,Q2,Q3,DETECT q
    class ACCEL,NATIVE,LOG run
    class SKIP,DEGRADE,DISABLED off
```

## Why native-first, accelerator-optional

The efficiency tools people bolt onto Claude Code can't be bundled: `rtk` is a
Rust binary, Context7/LSP are MCP servers invoked inside Claude's tool loop (not
callable from a CLI), others are Python or prompt-skills. So claude0:

- **replicates each capability natively in TypeScript** — always works, zero setup;
- **auto-detects the real tool** and uses it as an accelerator when present (only
  `rtk` is CLI-invokable; MCP tools are surfaced in `doctor` for the user to wire);
- **selects per step automatically** — the user never picks a tool;
- **logs net token delta** per capability, and auto-disables any that stops paying
  for itself (same rolling-window shape as the M2 router auto-demote).

## Ledger as the source of truth

Every operation appends one JSON line to `.claude0/ledger.jsonl`. This makes
savings falsifiable: `baseline_tokens` records what naive full-context would have
cost, so `(baseline - tokens_in)/baseline` is provable per run. M8 adds an optional
`capabilities[]` array per entry (backward-compatible) recording each capability's
`tokens_before`/`tokens_after`/`source`. `claude0 report` shows compiler savings;
`claude0 doctor` shows capability net-delta — kept separate so the two are never
double-counted.
