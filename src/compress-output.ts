import { compressNative } from "./integrations/compress";
import { findClaudeZeroRoot } from "./paths";
import { appendLedger } from "./ledger";
import { stashOutput } from "./output-store";
import { encode } from "gpt-tokenizer";

// `claude0 compress-output` — PostToolUse hook body. Reads the tool-result JSON
// from stdin, compresses the Bash output via the M8 native compressor, logs the
// real token delta, and emits the compressed text.
//
// NOTE on mechanism: how the compressed text reaches the model depends on what
// PostToolUse supports (replace vs augment). extractOutput/compress are correct
// either way; the CLI wrapper prints whatever envelope the hook contract needs.

// PostToolUse payload for a Bash tool: tool_response is {stdout, stderr, ...}.
// (Verified against Claude Code hook docs.)
export interface ToolResponse {
  stdout?: string;
  stderr?: string;
  interrupted?: boolean;
  isImage?: boolean;
}

export interface ToolResultInput {
  tool_name?: string;
  cwd?: string;
  tool_response?: ToolResponse | string;
}

/** Pull the Bash stdout from the PostToolUse payload. */
export function extractOutput(input: ToolResultInput): string {
  const r = input.tool_response;
  if (typeof r === "string") return r;
  if (r && typeof r === "object" && typeof r.stdout === "string") return r.stdout;
  return "";
}

export interface CompressOutcome {
  original: string;
  compressed: string;
  tokens_before: number;
  tokens_after: number;
}

export function compressToolOutput(input: ToolResultInput): CompressOutcome {
  const original = extractOutput(input);
  const compressed = original ? compressNative(original) : "";
  return {
    original,
    compressed,
    tokens_before: encode(original).length,
    tokens_after: encode(compressed).length,
  };
}

/** CLI entrypoint — never throws to the tool pipeline; any failure exits 0. */
export async function compressOutputFromStdin(readStdin: () => Promise<string>): Promise<void> {
  let raw = "";
  try {
    raw = await readStdin();
  } catch {
    process.exit(0);
  }
  if (!raw.trim()) process.exit(0);

  let input: ToolResultInput;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  if (input.tool_name && input.tool_name !== "Bash") process.exit(0);

  const outcome = compressToolOutput(input);

  // Log the real delta when run inside a claude0 repo.
  const root = findClaudeZeroRoot(input.cwd ?? process.cwd());
  if (root && outcome.tokens_before > 0) {
    try {
      appendLedger(
        {
          ts: new Date().toISOString(),
          milestone: "compress-output",
          step: "post-tool-use",
          attempt: 1,
          tier: "n/a",
          tokens_in: outcome.tokens_after,
          tokens_out: 0,
          baseline_tokens: outcome.tokens_before,
          pass: true,
          metric:
            outcome.tokens_before > 0
              ? (outcome.tokens_before - outcome.tokens_after) / outcome.tokens_before
              : 0,
          outcome: "PASS",
          retries: 0,
          rules_included: [],
          rules_excluded: [],
          note: `compress ${outcome.tokens_before}->${outcome.tokens_after}`,
        },
        root
      );
    } catch {
      // logging is best-effort — never block the tool pipeline
    }
  }

  // Replace what Claude sees with the compressed stdout (side effects already
  // happened — this only shrinks the model's view). Preserve stderr as-is.
  if (outcome.original && outcome.compressed !== outcome.original) {
    const origResp =
      input.tool_response && typeof input.tool_response === "object"
        ? input.tool_response
        : {};

    // Stash the full original and tell the model how to get it back. Elision is
    // salience-aware but never certain to keep everything the model wants, so we
    // make it reversible: the compressed view always carries a recall handle.
    let stdout = outcome.compressed;
    if (root) {
      try {
        const id = stashOutput(outcome.original, root);
        stdout +=
          `\n\n[claude0: output compressed ${outcome.tokens_before}→${outcome.tokens_after} tokens. ` +
          `Full original preserved — run \`claude0 recall ${id}\` if you need it.]`;
      } catch {
        // stash is best-effort; still emit the compressed view without a handle
      }
    }

    const envelope = {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        updatedToolOutput: {
          stdout,
          stderr: (origResp as ToolResponse).stderr ?? "",
          interrupted: (origResp as ToolResponse).interrupted ?? false,
          isImage: (origResp as ToolResponse).isImage ?? false,
        },
      },
    };
    process.stdout.write(JSON.stringify(envelope));
  }
  process.exit(0);
}
