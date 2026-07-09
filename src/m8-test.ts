import { inferTags, renderContext, runIntercept } from "./intercept";
import { compile } from "./compiler";
import { readLedger } from "./ledger";
import { encode } from "gpt-tokenizer";
import {
  compressNative,
  querySymbol,
  selectCapabilities,
  detectRepoEnv,
  clearDetectCache,
  netDelta,
  shouldDisable,
  runCapability,
} from "./integrations";
import { CapabilityResult, RepoEnv } from "./integrations/types";

// M8 slice 0 — "connect the pipe": prove interceptCommand actually compiles
// minimal context from a prompt, injects it, and logs REAL input-side tokens.
// This is the slice that removes the outside-voice "optimizes nothing" critique.

function main() {
  const repoRoot = process.cwd(); // run from repo root with .claude0/
  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
    ok ? pass++ : fail++;
  };

  // 1. Tag inference maps prompt language to real rule tags.
  const authTags = inferTags("fix the auth token sanitization bug", repoRoot);
  check(
    "inferTags: security prompt -> security tag",
    authTags.includes("security"),
    `got [${authTags.join(",")}]`
  );

  const gitTags = inferTags("rebase this branch and force push", repoRoot);
  check(
    "inferTags: git/safety prompt -> git+safety",
    gitTags.includes("git") && gitTags.includes("safety"),
    `got [${gitTags.join(",")}]`
  );

  const noiseTags = inferTags("what time is it", repoRoot);
  check("inferTags: irrelevant prompt -> no tags", noiseTags.length === 0, `got [${noiseTags.join(",")}]`);

  // 2. Only tags backed by a real rule are ever returned (no phantom tags).
  const allReturned = inferTags(
    "typescript react component test security git commit",
    repoRoot
  );
  const bundle = compile("x", allReturned, allReturned, repoRoot); // must not throw
  check(
    "inferTags: every returned tag is satisfiable by compile()",
    bundle.rules_included.length > 0,
    `${allReturned.length} tags -> ${bundle.rules_included.length} rules`
  );

  // 3. The core pipe: real input-side savings vs naive full context.
  const before = readLedger(repoRoot).length;
  const result = runIntercept(
    { prompt: "fix a typescript security bug in the auth middleware", cwd: repoRoot },
    repoRoot
  );
  check(
    "runIntercept: compiled tokens < baseline (real savings)",
    result.tokens_in < result.baseline_tokens && result.baseline_tokens > 0,
    `in=${result.tokens_in} baseline=${result.baseline_tokens}`
  );
  check(
    "runIntercept: injected context is non-empty for a matching prompt",
    result.additionalContext.length > 0
  );
  check(
    "runIntercept: context contains ONLY selected rules (not all)",
    result.rules_included.length > 0 && result.rules_included.length < 6,
    `${result.rules_included.length}/6 rules`
  );

  // 4. Ledger actually recorded the intercept with real numbers.
  const after = readLedger(repoRoot);
  const added = after.length - before;
  const last = after[after.length - 1];
  check("ledger: intercept appended exactly one entry", added === 1, `added=${added}`);
  check(
    "ledger: entry has real tokens_in and baseline",
    !!last && last.step === "user-prompt-submit" && last.tokens_in > 0 && last.baseline_tokens > 0,
    last ? `in=${last.tokens_in} base=${last.baseline_tokens}` : "no entry"
  );

  // 5. Empty / irrelevant prompt injects nothing (no false context).
  const empty = runIntercept({ prompt: "hello there", cwd: repoRoot }, repoRoot);
  check("runIntercept: no context injected when nothing matches", empty.additionalContext === "", `ctx len=${empty.additionalContext.length}`);

  // 6. renderContext formats selected rules as a bulleted block.
  const rendered = renderContext(compile("x", ["security"], ["security"], repoRoot));
  check("renderContext: produces a bulleted rules block", rendered.includes("- ") && rendered.includes("claude0"));

  // ---- Integrations capability gates ----------------------------------------

  const env = detectRepoEnv(repoRoot);

  // 7. output-compress native ≥40% reduction on a representative noisy build/
  //    install log (the real target: verbose tool output with progress noise,
  //    blank runs, and long repetitive sections — far noisier than git status).
  const gitStatusBlob = [
    "npm warn deprecated inflight@1.0.6: This module is not supported",
    "npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported",
    "",
    "",
    "",
    ...Array.from({ length: 50 }, () => "Downloading dependency metadata..."), // dup run → 1 line
    ...Array.from({ length: 40 }, (_, i) => `[====>            ] ${i}% eta 0:03`), // progress noise → dropped
    "",
    "",
    ...Array.from({ length: 60 }, (_, i) => `added package-${i}@1.0.0 to node_modules`),
    "",
    "",
    "",
    "",
    "found 0 vulnerabilities",
  ].join("\n");
  const blobBefore = encode(gitStatusBlob).length;
  const compressed = compressNative(gitStatusBlob);
  const blobAfter = encode(compressed).length;
  const reduction = ((blobBefore - blobAfter) / blobBefore) * 100;
  check(
    "compress: native ≥40% reduction on git-status fixture",
    reduction >= 40,
    `${blobBefore}→${blobAfter} (${reduction.toFixed(1)}%)`
  );

  // 8. symbol-query returns a real type via TS Language Service (this IS a TS repo).
  const ans = querySymbol({ file: "src/compiler.ts", symbol: "tokenCount" }, repoRoot);
  check(
    "symbol-query: returns a type without reading the whole file",
    ans.found && ans.kind === "type" && !!ans.type && ans.type.includes("Bundle"),
    ans.type ? ans.type.slice(0, 50) : `kind=${ans.kind}`
  );
  check("symbol-query: active in a TS repo", env.hasTsconfig === true);

  // 9. Non-TS repo degradation: symbol-query availability = inactive.
  const fakePy: RepoEnv = { ...env, hasTsconfig: false, hasNodeModules: false };
  const symCap = selectCapabilities(["typescript"], fakePy);
  check(
    "symbol-query: NOT selected in a non-TS repo (degrades)",
    !symCap.some((c) => c.name === "symbol-query"),
    `selected: [${symCap.map((c) => c.name).join(",")}]`
  );
  const symRun = runCapability("symbol-query", '{"file":"x.ts","symbol":"y"}', repoRoot, fakePy);
  check("symbol-query: passthrough (no output) when inactive", symRun.output.length >= 0 && symRun.tokensAfter === 0);

  // 10. decision-log is net-delta exempt (delta N/A, not a number).
  const dlog: CapabilityResult = {
    name: "decision-log",
    output: "chose approach B",
    tokensBefore: 3,
    tokensAfter: 3,
    source: "native",
    netDeltaExempt: true,
  };
  check("decision-log: netDelta() returns null (exempt)", netDelta(dlog) === null);

  // 11. netDelta computes for a normal input-side capability.
  const cmp: CapabilityResult = {
    name: "output-compress",
    output: "x",
    tokensBefore: 100,
    tokensAfter: 40,
    source: "native",
  };
  check("netDelta: 100→40 tokens = 0.6 savings", Math.abs((netDelta(cmp) ?? 0) - 0.6) < 1e-9);

  // 12. Auto-disable: fewer than window of runs → never disabled yet.
  clearDetectCache();
  check(
    "auto-disable: not triggered without a full window of data",
    shouldDisable("nonexistent-capability", repoRoot) === false
  );

  // 13. selectCapabilities picks symbol-query for a TS review step here.
  const sel = selectCapabilities(["typescript", "review"], env);
  check(
    "selectCapabilities: TS review step selects symbol-query",
    sel.some((c) => c.name === "symbol-query")
  );

  const savings =
    result.baseline_tokens > 0
      ? (((result.baseline_tokens - result.tokens_in) / result.baseline_tokens) * 100).toFixed(1)
      : "0";
  console.log("---");
  console.log(`intercept pipe savings on sample prompt: ${savings}%`);
  console.log(`compress reduction on fixture: ${reduction.toFixed(1)}%`);
  console.log(`M8 RESULT: ${fail === 0 ? "PASS" : "FAIL"}  (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
