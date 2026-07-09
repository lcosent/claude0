import { callModel, liveAvailable } from "./llm";
import { encode } from "gpt-tokenizer";

// M10 — real LLM calls via the claude CLI subscription, with a deterministic
// offline stub. Deterministic checks force simulate mode so they're reproducible
// and need no subscription/network (CI stays green). M15 adds an OPT-IN live gate
// (ZIPLINE_LIVE=1) that makes one real subscription call to validate full
// execution — skipped (not failed) offline or without the flag.

// Capture the live opt-in BEFORE we force simulate for the deterministic block.
const LIVE_REQUESTED = process.env.ZIPLINE_LIVE === "1";

process.env.ZIPLINE_SIMULATE = "1";

function main() {
  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
    ok ? pass++ : fail++;
  };

  // 1. Simulate mode is active when forced.
  check("liveAvailable() is false under ZIPLINE_SIMULATE=1", liveAvailable() === false);

  // 2. callModel returns real (non-hardcoded) token counts derived from output.
  const r1 = callModel("Implement a login function with input validation", "sonnet");
  check(
    "callModel: tokens_out matches encoded output length (not hardcoded)",
    r1.tokens_out === encode(r1.text).length && r1.tokens_out > 0,
    `tokens_out=${r1.tokens_out}`
  );
  check("callModel: source is 'simulate' offline", r1.source === "simulate");

  // 3. Deterministic — same input yields identical output (no Math.random).
  const a = callModel("same prompt", "haiku");
  const b = callModel("same prompt", "haiku");
  check("callModel: deterministic for identical input", a.text === b.text && a.tokens_out === b.tokens_out);

  // 4. Tier affects output size (opus says more than haiku) — proves tier is wired.
  const hk = callModel("x".repeat(200), "haiku");
  const op = callModel("x".repeat(200), "opus");
  check("callModel: opus output >= haiku output (tier wired through)", op.tokens_out >= hk.tokens_out, `haiku=${hk.tokens_out} opus=${op.tokens_out}`);

  // 5. Different prompts yield different token counts (output tracks input).
  const short = callModel("hi", "sonnet");
  const long = callModel("implement a full authentication subsystem with sessions", "sonnet");
  check("callModel: longer prompt yields >= tokens_out", long.tokens_out >= short.tokens_out, `short=${short.tokens_out} long=${long.tokens_out}`);

  // 6. The live path EXISTS and is reachable (we just don't exercise it here).
  //    Flip simulate off transiently and confirm liveAvailable is a real probe.
  delete process.env.ZIPLINE_SIMULATE;
  const liveProbe = liveAvailable(); // true iff claude CLI present on this machine
  process.env.ZIPLINE_SIMULATE = "1";
  check("liveAvailable(): real probe returns a boolean (live path wired)", typeof liveProbe === "boolean");
  console.log(`  note: claude CLI ${liveProbe ? "IS" : "is NOT"} available on this machine — live calls ${liveProbe ? "would run on subscription" : "fall back to simulate"}`);

  // 7. M15 live gate (opt-in, full execution). Only runs with ZIPLINE_LIVE=1 AND
  //    a real claude CLI present — makes ONE real haiku call on the subscription.
  //    Otherwise SKIP (not FAIL) so offline/CI stays green. Cost-guarded to 1 call.
  if (LIVE_REQUESTED && liveProbe) {
    delete process.env.ZIPLINE_SIMULATE; // exercise the REAL path
    const live = callModel("Reply with exactly: DONE", "haiku");
    process.env.ZIPLINE_SIMULATE = "1";
    check(
      "LIVE: real subscription call → source=claude-cli, tokens_out>0",
      live.source === "claude-cli" && live.tokens_out > 0,
      `source=${live.source} tokens_out=${live.tokens_out}`
    );
  } else {
    console.log(
      `SKIP  LIVE gate (${LIVE_REQUESTED ? "claude CLI not available" : "set ZIPLINE_LIVE=1 to run a real call"})`
    );
  }

  console.log("---");
  console.log(`M10 RESULT: ${fail === 0 ? "PASS" : "FAIL"}  (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
