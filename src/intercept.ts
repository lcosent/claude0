import { compile, fullContextBundle, tokenCount, loadRules, Bundle } from "./compiler";
import { appendLedger } from "./ledger";
import { findClaudeZeroRoot } from "./paths";

// Payload Claude Code sends on stdin for a UserPromptSubmit hook.
export interface HookInput {
  prompt?: string;
  cwd?: string;
  hook_event_name?: string;
  session_id?: string;
}

// What we hand back so Claude Code injects it alongside the prompt.
export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit";
    additionalContext: string;
  };
}

// Keyword → rule-tag inference. Maps prompt language to the tags the compiler
// selects rules by. Deliberately simple and explicit (no ML): a word in the
// prompt implies a concern. Tags with no keyword hit are simply not selected.
const TAG_KEYWORDS: Record<string, string[]> = {
  typescript: ["typescript", "ts", "type", "interface", "tsx", "generic"],
  style: ["refactor", "clean up", "rename", "lint", "format"],
  testing: ["test", "spec", "coverage", "regression", "assert"],
  security: ["auth", "sanitize", "injection", "xss", "csrf", "secret", "token", "password", "vulnerab"],
  react: ["react", "component", "hook", "jsx", "tsx", "props", "state"],
  ui: ["ui", "button", "modal", "css", "style", "layout", "page", "screen"],
  frontend: ["frontend", "browser", "dom", "render"],
  git: ["git", "commit", "branch", "rebase", "merge", "push", "pull request", "pr"],
  commits: ["commit message", "commit", "changelog"],
  safety: ["force", "reset", "delete", "drop", "destructive", "hard reset"],
};

/**
 * Infers rule tags from prompt text. Returns the tags that have at least one
 * keyword hit AND exist among the repo's actual rules (so we never select a
 * tag no rule can satisfy). Case-insensitive substring match.
 */
export function inferTags(prompt: string, repoRoot: string): string[] {
  const lower = prompt.toLowerCase();
  const availableTags = new Set(loadRules(repoRoot).flatMap((r) => r.tags));
  const hits: string[] = [];
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (!availableTags.has(tag)) continue;
    if (keywords.some((kw) => lower.includes(kw))) hits.push(tag);
  }
  return hits;
}

/**
 * Renders a compiled bundle as the context string injected into the prompt.
 * Only the selected rule bodies — this is the whole point: minimal, not full.
 */
export function renderContext(bundle: Bundle): string {
  if (bundle.constraints.length === 0) return "";
  return [
    "Relevant project rules for this task (compiled by claude0):",
    ...bundle.constraints.map((c) => `- ${c}`),
  ].join("\n");
}

export interface InterceptResult {
  additionalContext: string;
  tokens_in: number;
  baseline_tokens: number;
  tags: string[];
  rules_included: string[];
}

/**
 * The core pipe: prompt → inferred tags → compiled bundle → injected context,
 * with the real input-side token cost logged to the ledger. Pure enough to
 * unit-test; the CLI wrapper handles stdin/stdout/exit.
 */
export function runIntercept(input: HookInput, repoRoot: string): InterceptResult {
  const prompt = input.prompt ?? "";
  const tags = inferTags(prompt, repoRoot);

  // baseline = what dumping every rule (naive full context) would have cost.
  const baseline = tokenCount(fullContextBundle(prompt, repoRoot));

  let bundle: Bundle;
  try {
    bundle = compile(prompt, tags, tags, repoRoot);
  } catch {
    // Silent-drop guard tripped, or no rules matched. Inject nothing rather
    // than risk a wrong partial context; log the miss so it's auditable.
    bundle = { objective: prompt, constraints: [], rules_included: [], rules_excluded: [] };
  }

  const additionalContext = renderContext(bundle);
  const tokens_in = tokenCount(bundle);

  appendLedger(
    {
      ts: new Date().toISOString(),
      milestone: "intercept",
      step: "user-prompt-submit",
      attempt: 1,
      tier: "n/a",
      tokens_in,
      tokens_out: 0,
      baseline_tokens: baseline,
      pass: true,
      metric: baseline > 0 ? (baseline - tokens_in) / baseline : 0,
      outcome: "PASS",
      retries: 0,
      rules_included: bundle.rules_included,
      rules_excluded: bundle.rules_excluded,
      note: `tags=[${tags.join(",")}] savings=${
        baseline > 0 ? (((baseline - tokens_in) / baseline) * 100).toFixed(1) : "0"
      }%`,
    },
    repoRoot
  );

  return {
    additionalContext,
    tokens_in,
    baseline_tokens: baseline,
    tags,
    rules_included: bundle.rules_included,
  };
}

/**
 * CLI entrypoint. Reads the hook JSON from stdin, runs the pipe, and prints
 * the additionalContext envelope. Never throws to the caller: a hook that
 * errors must not break the user's prompt, so any failure exits 0 silently.
 */
export async function interceptFromStdin(readStdin: () => Promise<string>): Promise<void> {
  let raw = "";
  try {
    raw = await readStdin();
  } catch {
    process.exit(0);
  }

  let input: HookInput = {};
  if (raw.trim()) {
    try {
      input = JSON.parse(raw);
    } catch {
      // Not JSON (e.g. invoked manually) — nothing to compile against.
      process.exit(0);
    }
  }

  // Resolve the claude0 root from the hook's cwd (the user's project), not ours.
  const root = findClaudeZeroRoot(input.cwd ?? process.cwd());
  if (!root) {
    // Project isn't claude0-initialized; do nothing, don't disturb the prompt.
    process.exit(0);
  }

  let result: InterceptResult;
  try {
    result = runIntercept(input, root);
  } catch {
    process.exit(0);
  }

  if (result.additionalContext) {
    const out: HookOutput = {
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: result.additionalContext,
      },
    };
    process.stdout.write(JSON.stringify(out));
  }
  process.exit(0);
}
