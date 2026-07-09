import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { SAMPLE_RULES } from "./init-templates";
import { runIntercept } from "./intercept";
import { compressToolOutput } from "./compress-output";

// M19 — production-ready hook performance. Both claude0 hooks sit on Claude
// Code's hot path: `intercept` gates every user prompt (UserPromptSubmit) and
// `compress-output` gates every Bash result (PostToolUse). If either is slow,
// the user feels it on every keystroke-to-response. This pins a hard latency
// budget so an accidental O(n^2) or a heavyweight dependency import can't
// silently regress the experience. Budgets are the in-process function cost
// (excludes Node/tsx startup, which the real hook pays once per spawn).

const INTERCEPT_BUDGET_MS = 150;
const COMPRESS_BUDGET_MS = 150;
// Cold call can include lazy tokenizer init; take the best of a few warm runs
// so we measure steady-state per-call cost, not one-time module warmup.
const SAMPLES = 5;

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  cond ? pass++ : fail++;
}

/** Best (minimum) wall-clock of `fn` over SAMPLES runs, in milliseconds. */
function bestOf(fn: () => void): number {
  let best = Infinity;
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = process.hrtime.bigint();
    fn();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms < best) best = ms;
  }
  return best;
}

// Seed a real repo with the shipped sample rules so intercept exercises the
// actual compile/token-count path, not an empty one.
const repo = fs.mkdtempSync(path.join(os.tmpdir(), "claude0-m19-"));
const rulesDir = path.join(repo, ".claude0", "rules");
fs.mkdirSync(rulesDir, { recursive: true });
for (const [file, content] of Object.entries(SAMPLE_RULES)) {
  fs.writeFileSync(path.join(rulesDir, file), content);
}

// A representative prompt that triggers several tags (security, typescript,
// testing, git) so the compiler does real selection work.
const prompt =
  "Refactor the auth token sanitization in TypeScript, add tests for the " +
  "regression, and commit the change on a new branch.";

const interceptMs = bestOf(() => {
  runIntercept({ prompt, cwd: repo }, repo);
});
check(
  `intercept under ${INTERCEPT_BUDGET_MS}ms`,
  interceptMs < INTERCEPT_BUDGET_MS,
  `${interceptMs.toFixed(1)}ms`
);

// A large, noisy Bash output — the worst case compress-output faces (a verbose
// build/test log). 4000 lines with the redundancy the compressor targets.
const bigLog = Array.from({ length: 4000 }, (_, i) =>
  i % 3 === 0
    ? `[INFO] step ${i} completed successfully in ${i}ms`
    : i % 3 === 1
      ? `    at Object.<anonymous> (/repo/src/file${i % 20}.ts:${i}:12)`
      : `npm warn deprecated pkg${i % 50}@1.0.0: use pkg${i % 50}@2`
).join("\n");

const compressInput = { tool_name: "Bash", tool_response: { stdout: bigLog } };
const compressMs = bestOf(() => {
  compressToolOutput(compressInput);
});
check(
  `compress-output under ${COMPRESS_BUDGET_MS}ms on a 4000-line log`,
  compressMs < COMPRESS_BUDGET_MS,
  `${compressMs.toFixed(1)}ms`
);

// Sanity: compress must actually shrink the payload (else the budget is moot).
const outcome = compressToolOutput(compressInput);
check(
  "compress-output still reduces tokens",
  outcome.tokens_after < outcome.tokens_before,
  `${outcome.tokens_before}→${outcome.tokens_after}`
);

// Empty payloads (common: silent commands) must be effectively free.
const emptyMs = bestOf(() => {
  compressToolOutput({ tool_name: "Bash", tool_response: { stdout: "" } });
});
check("compress-output on empty payload is trivial", emptyMs < 5, `${emptyMs.toFixed(2)}ms`);

fs.rmSync(repo, { recursive: true, force: true });

console.log(`\nM19 RESULT: ${fail === 0 ? "PASS" : "FAIL"}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
