// M21 gate: reasoning effort is a first-class second axis. Policy can carry an
// explicit `tier@effort` override, bare tiers keep their per-tier default,
// xhigh/max are never chosen by a default, and the effort lands in the ledger.
// Proven offline.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  ALL_TIERS,
  DEFAULT_EFFORT_BY_TIER,
  effortForTier,
  entryTier,
  entryEffort,
} from "./policy";
import { parsePolicy, serializePolicy } from "./policy-sync";
import { appendLedger, readLedger } from "./ledger";

let ok = true;
function gate(name: string, cond: boolean) {
  console.log(`GATE ${name}: ${cond ? "PASS" : "FAIL"}`);
  if (!cond) ok = false;
}

// 1. Default effort map is sane and NEVER xhigh/max (article rule).
gate(
  "no default effort is a furnace (xhigh/max)",
  ALL_TIERS.every((t) => !["xhigh", "max"].includes(DEFAULT_EFFORT_BY_TIER[t]))
);
gate("haiku defaults to low", effortForTier("haiku") === "low");
gate("sonnet defaults to medium", effortForTier("sonnet") === "medium");
gate("opus/fable default to high", effortForTier("opus") === "high" && effortForTier("fable") === "high");

// 2. parsePolicy accepts BOTH the bare form and the tier@effort form.
const parsed = parsePolicy(
  [
    "context-compile: haiku", // bare → default effort
    "design-synthesis: fable@high", // explicit override
    "risky-step: opus@xhigh", // explicit opt-in furnace is allowed
  ].join("\n")
);
gate("bare tier parses to a string entry", parsed["context-compile"] === "haiku");
gate("bare tier uses default effort", entryEffort(parsed["context-compile"]) === "low");
gate("tier@effort parses tier", entryTier(parsed["design-synthesis"]) === "fable");
gate("tier@effort parses effort", entryEffort(parsed["design-synthesis"]) === "high");
gate("explicit xhigh honored (opt-in only)", entryEffort(parsed["risky-step"]) === "xhigh");

// 3. Round-trip: bare stays bare (byte-identical for old policies), overrides
//    serialize back to tier@effort.
const round = parsePolicy(serializePolicy(parsed));
gate("round-trip preserves bare entry", round["context-compile"] === "haiku");
gate(
  "round-trip preserves override",
  entryTier(round["design-synthesis"]) === "fable" && entryEffort(round["design-synthesis"]) === "high"
);
const bareOnly = "a: haiku\nb: sonnet\nc: opus\n";
gate(
  "pre-M21 bare policy round-trips unchanged",
  serializePolicy(parsePolicy(bareOnly)).includes("a: haiku") &&
    !serializePolicy(parsePolicy(bareOnly)).includes("@")
);

// 4. Effort lands in the ledger (additive field, old entries still parse).
const tmp = path.join(os.tmpdir(), `claude0-m21-${process.pid}`);
fs.mkdirSync(path.join(tmp, ".claude0"), { recursive: true });
appendLedger(
  {
    ts: new Date().toISOString(),
    milestone: "M21",
    step: "with-effort",
    attempt: 1,
    tier: "fable",
    effort: "high",
    tokens_in: 10,
    tokens_out: 5,
    baseline_tokens: 20,
    pass: true,
    metric: 1,
    outcome: "PASS",
    retries: 0,
    rules_included: [],
    rules_excluded: [],
    note: "",
  },
  tmp
);
// A pre-M21 line (no effort field at all) must still parse.
fs.appendFileSync(
  path.join(tmp, ".claude0", "ledger.jsonl"),
  JSON.stringify({
    ts: "2026-01-01T00:00:00Z",
    milestone: "old",
    step: "legacy",
    attempt: 1,
    tier: "sonnet",
    tokens_in: 1,
    tokens_out: 1,
    baseline_tokens: 2,
    pass: true,
    metric: 1,
    outcome: "PASS",
    retries: 0,
  }) + "\n"
);
const entries = readLedger(tmp);
gate("effort persisted and read back", entries.some((e) => e.effort === "high"));
gate("pre-M21 entry (no effort) still parses", entries.some((e) => e.step === "legacy" && e.effort === undefined));
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`M21 RESULT: ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
