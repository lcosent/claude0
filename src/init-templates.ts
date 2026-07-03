export const SAMPLE_RULES: Record<string, string> = {
  "typescript-style.md": `---
tags: [typescript, style]
---
Prefer editing existing files over creating new ones. Do not add comments explaining what code does; only comment on non-obvious why. Avoid premature abstraction — three similar lines beat a speculative helper. Use strict TypeScript; no implicit any.`,

  "git-safety.md": `---
tags: [git, safety]
---
Never force-push to main. Never run \`git reset --hard\` without checking \`git status\` first for uncommitted work. Always create new commits rather than amending published ones. Never skip commit hooks with \`--no-verify\` unless explicitly asked.`,

  "testing.md": `---
tags: [testing]
---
Write tests for new functionality. Prefer integration tests over mocks when database/external state matters. Name tests clearly: what is being tested and what the expected outcome is.`,

  "security.md": `---
tags: [security]
---
Sanitize all user input. Never construct SQL queries with string concatenation — use parameterized queries. Avoid exposing internal errors to users; log them server-side and return generic error messages. Check authorization at every handler.`,

  "react-ui.md": `---
tags: [react, ui]
---
Keep components focused on one responsibility. Extract hooks for complex stateful logic. Prefer composition over deeply nested conditional rendering. Use semantic HTML and ARIA attributes for accessibility.`,

  "commits.md": `---
tags: [git, commits]
---
Write commit messages that explain why, not what. Use conventional commit format: \`feat:\`, \`fix:\`, \`refactor:\`, \`docs:\`, \`test:\`. Keep commits atomic — one logical change per commit. Always review \`git diff --staged\` before committing.`,
};

export const DEFAULT_POLICY = `# Harness routing policy
# Maps step types to Anthropic model tiers (haiku/sonnet/opus)
# Lower tiers are cheaper; escalation happens on contract validation failure

context-compile: haiku
structured-extract: haiku
unit-test-write: sonnet
verify-output: sonnet
implement-small-fn: sonnet
design-synthesis: opus
debate: sonnet
review: sonnet
`;

// Claude Code hook format: event keys are PascalCase and each maps to an array
// of matcher-objects, each holding a "hooks" array of command entries.
// UserPromptSubmit takes no matcher — it fires on every prompt submission.
export const HOOK_EVENT = "UserPromptSubmit";
export const HOOK_COMMAND = "harness intercept";

// PostToolUse compresses verbose Bash output before it reaches the model's
// context. matcher "Bash" is an exact tool-name match; the command replaces the
// model's view via hookSpecificOutput.updatedToolOutput (side effects already ran).
export const POST_TOOL_EVENT = "PostToolUse";
export const POST_TOOL_MATCHER = "Bash";
export const POST_TOOL_COMMAND = "harness compress-output";

export const HOOK_CONFIG = {
  hooks: {
    [HOOK_EVENT]: [
      {
        hooks: [{ type: "command", command: HOOK_COMMAND }],
      },
    ],
    [POST_TOOL_EVENT]: [
      {
        matcher: POST_TOOL_MATCHER,
        hooks: [{ type: "command", command: POST_TOOL_COMMAND }],
      },
    ],
  },
};

export const README = `# Harness

This repository is configured with **harness** — a deterministic orchestration spine for Claude Code.

## What It Does

- **Context compilation**: Every step gets minimal context (only relevant rules), not the full CLAUDE.md
- **Token savings**: Median 60-70% reduction in input tokens
- **Learning**: Every operation logs to \`.harness/ledger.jsonl\` for continuous improvement
- **Routing**: Picks the cheapest Anthropic tier (Haiku/Sonnet/Opus) that can pass each step

## Daily Usage

After initialization, harness is **transparent** — just use Claude Code normally:

\`\`\`bash
claude> fix the auth bug
# Harness automatically:
# - Compiles minimal context (only security, typescript, testing rules)
# - Routes to appropriate tier (likely Sonnet for implementation)
# - Logs tokens_in, baseline_tokens, savings to ledger
\`\`\`

## Explicit Orchestration

For complex features, use the full design → plan → build → verify loop:

\`\`\`bash
claude> /harness build "add user authentication"
# Runs: DESIGN (debate) → PLAN (milestones) → GATE → BUILD → VERIFY
\`\`\`

## Reporting

Check token savings and system behavior:

\`\`\`bash
harness report
# Shows: total runs, savings %, tier mix, escalation rate, stuck count
\`\`\`

## Files

- \`.harness/rules/*.md\` — Context rules, one concern per file, frontmatter-tagged
- \`.harness/policy.yaml\` — Step-to-tier routing policy (auto-tuned over time)
- \`.harness/ledger.jsonl\` — Append-only log of every operation
- \`.claude/settings.json\` — Hook configuration (added by \`harness init\`)

## Learn More

- Design doc: [DESIGN.md](./DESIGN.md)
- Milestones: [MILESTONES.md](./MILESTONES.md)
`;
