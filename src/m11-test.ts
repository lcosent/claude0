import { extractOutput, compressToolOutput, ToolResultInput } from "./compress-output";
import { HOOK_CONFIG, POST_TOOL_EVENT, POST_TOOL_MATCHER, POST_TOOL_COMMAND } from "./init-templates";
import { encode } from "gpt-tokenizer";

// M11 — PostToolUse compression of real Bash output. Verified against the hook
// contract: extract tool_response.stdout, compress via M8 native, emit an
// updatedToolOutput envelope. init registers a Bash-matched PostToolUse hook.

function main() {
  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
    ok ? pass++ : fail++;
  };

  // A realistic noisy Bash payload (npm install-style).
  const noisy = [
    "npm warn deprecated inflight@1.0.6: unsupported",
    "",
    "",
    ...Array.from({ length: 50 }, () => "Downloading metadata..."),
    ...Array.from({ length: 40 }, (_, i) => `[===>      ] ${i}%`),
    "",
    "",
    ...Array.from({ length: 60 }, (_, i) => `added pkg-${i}@1.0.0`),
    "",
    "found 0 vulnerabilities",
  ].join("\n");

  const payload: ToolResultInput = {
    tool_name: "Bash",
    cwd: process.cwd(),
    tool_response: { stdout: noisy, stderr: "", interrupted: false, isImage: false },
  };

  // 1. Extract pulls stdout from tool_response (the verified field).
  check("extractOutput: reads tool_response.stdout", extractOutput(payload) === noisy);

  // 2. Compression achieves >=40% token reduction on the noisy fixture.
  const outcome = compressToolOutput(payload);
  const reduction = ((outcome.tokens_before - outcome.tokens_after) / outcome.tokens_before) * 100;
  check(
    "compress: >=40% token reduction on noisy Bash output",
    reduction >= 40,
    `${outcome.tokens_before}→${outcome.tokens_after} (${reduction.toFixed(1)}%)`
  );

  // 3. Compressed output is non-empty and smaller than original.
  check(
    "compress: output non-empty and smaller",
    outcome.compressed.length > 0 && outcome.compressed.length < outcome.original.length
  );

  // 4. Non-Bash tool → extractor still safe; string tool_response handled.
  check("extractOutput: string tool_response handled", extractOutput({ tool_response: "raw text" } as ToolResultInput) === "raw text");
  check("extractOutput: missing tool_response → empty", extractOutput({ tool_name: "Bash" }) === "");

  // 5. init registers a PostToolUse hook, Bash-matched, with our command.
  const entries = (HOOK_CONFIG.hooks as any)[POST_TOOL_EVENT];
  const ok =
    Array.isArray(entries) &&
    entries[0]?.matcher === POST_TOOL_MATCHER &&
    entries[0]?.hooks?.[0]?.command === POST_TOOL_COMMAND &&
    entries[0]?.hooks?.[0]?.type === "command";
  check("init: PostToolUse hook registered (Bash matcher + compress-output)", ok, `matcher=${entries?.[0]?.matcher}`);

  // 6. Idempotent-ish: clean output that can't shrink returns compressed<=before.
  const tiny: ToolResultInput = { tool_name: "Bash", tool_response: { stdout: "ok" } };
  const t = compressToolOutput(tiny);
  check("compress: tiny output doesn't grow", t.tokens_after <= Math.max(t.tokens_before, encode("ok").length));

  console.log("---");
  console.log(`compress reduction on fixture: ${reduction.toFixed(1)}%`);
  console.log(`M11 RESULT: ${fail === 0 ? "PASS" : "FAIL"}  (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
