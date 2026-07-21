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

/**
 * Below this many tokens, compression cannot pay for its own recall banner.
 * Measured: the banner is ~39 tokens, so a 3-token result became ~42.
 */
export const COMPRESS_MIN_TOKENS = 400;

/** The recall handle appended to every compressed view. */
export function renderBanner(before: number, after: number, id: string): string {
  return (
    `\n\n[claude0: output compressed ${before}→${after} tokens. ` +
    `Full original preserved — run \`claude0 recall ${id}\` if you need it.]`
  );
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
    const parsed = JSON.parse(raw);
    // `null`, numbers and arrays are all valid JSON that would make the property
    // accesses below throw. Treat anything but a plain object as unusable.
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      process.exit(0);
    }
    input = parsed;
  } catch {
    process.exit(0);
  }
  if (input.tool_name && input.tool_name !== "Bash") process.exit(0);

  // compressToolOutput runs the tokenizer and the native compressor over
  // arbitrary tool output; a throw here must degrade to "emit nothing" rather
  // than surface a stack trace into the user's session.
  let outcome: CompressOutcome;
  try {
    outcome = compressToolOutput(input);
  } catch {
    process.exit(0);
  }

  const root = findClaudeZeroRoot(input.cwd ?? process.cwd());
  const origResp =
    input.tool_response && typeof input.tool_response === "object"
      ? input.tool_response
      : {};

  // Below the floor there is nothing worth compressing: the recall banner alone
  // costs ~39 tokens, so rewriting a short result made it several times LARGER
  // while also writing a stash file to disk. Images are passed through for the
  // same reason — the payload isn't line-oriented text.
  if (
    !outcome.original ||
    outcome.tokens_before < COMPRESS_MIN_TOKENS ||
    (origResp as ToolResponse).isImage
  ) {
    process.exit(0);
  }

  // Build the exact string that will be emitted BEFORE deciding to emit it.
  // Measuring outcome.compressed alone overstated savings by the banner's cost
  // and — on salience-dense output, where many short elision markers each cost
  // more than the lines they replace — could hide a net EXPANSION.
  let stdout = outcome.compressed;
  let recallId: string | null = null;
  if (root) {
    try {
      recallId = stashOutput(outcome.original, root);
    } catch {
      // stash is best-effort; fall through and emit without a recall handle
    }
  }
  if (recallId) {
    stdout += renderBanner(outcome.tokens_before, encode(outcome.compressed).length, recallId);
  }
  const tokensEmitted = encode(stdout).length;

  // The guarantee: claude0 never makes the model's view bigger. If compression
  // didn't actually pay for itself, pass the original through untouched.
  const worthIt = tokensEmitted < outcome.tokens_before;

  // Log what really happened, including the skips — a compressor that silently
  // declines is a fact the ledger should show, not hide.
  if (root) {
    try {
      appendLedger(
        {
          ts: new Date().toISOString(),
          milestone: "compress-output",
          step: "post-tool-use",
          attempt: 1,
          tier: "n/a",
          tokens_in: worthIt ? tokensEmitted : outcome.tokens_before,
          tokens_out: 0,
          baseline_tokens: outcome.tokens_before,
          pass: true,
          metric: worthIt
            ? (outcome.tokens_before - tokensEmitted) / outcome.tokens_before
            : 0,
          outcome: "PASS",
          retries: 0,
          rules_included: [],
          rules_excluded: [],
          note: worthIt
            ? `compress ${outcome.tokens_before}->${tokensEmitted} (emitted, banner included)`
            : `skipped: no net benefit (${outcome.tokens_before}->${tokensEmitted})`,
        },
        root
      );
    } catch {
      // logging is best-effort — never block the tool pipeline
    }
  }

  // Replace what Claude sees with the compressed stdout (side effects already
  // happened — this only shrinks the model's view). Preserve stderr as-is.
  if (worthIt && outcome.compressed !== outcome.original) {
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
