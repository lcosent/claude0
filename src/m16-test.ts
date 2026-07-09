import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as api from "./index";
import { LedgerEntry, LEDGER_SCHEMA_VERSION, appendLedger, readLedger } from "./ledger";

// M16 — stable public API surface. The barrel (src/index.ts) is the frozen v1
// contract; the ledger carries a self-describing schema version so future
// migrations can branch on it and pre-v1 ledgers stay readable.

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ""}`);
    pass++;
  } else {
    console.log(`FAIL  ${name}${detail ? `  (${detail})` : ""}`);
    fail++;
  }
}

// 1. Every symbol the barrel promises actually resolves (no dangling re-export).
const REQUIRED_EXPORTS = [
  // compiler
  "loadRules", "compile", "fullContextBundle", "tokenCount",
  // policy
  "TIER_ORDER", "TIER_COST", "nextTier",
  // policy sync
  "parsePolicy", "serializePolicy", "centralPolicyPath", "pushPolicy", "pullPolicy",
  // ledger
  "LedgerEntry", "LEDGER_SCHEMA_VERSION", "appendLedger", "readLedger", "ledgerTail",
  // contract
  "StepOutputSchema", "validateWithRepair",
  // report + learn
  "buildReport", "detectRegression", "reconciles", "proposeChanges", "computeStats", "renderProposals",
  // integrations
  "CAPABILITIES", "getCapability", "selectCapabilities", "detectRepoEnv",
  "runCapability", "resolveAvailability", "shouldDisable", "netDelta",
  // paths
  "findClaudeZeroRoot", "requireClaudeZeroRoot",
  // version
  "API_VERSION",
];
const missing = REQUIRED_EXPORTS.filter((k) => (api as Record<string, unknown>)[k] === undefined);
check("barrel: all promised exports resolve", missing.length === 0, missing.length ? `missing: ${missing.join(",")}` : `${REQUIRED_EXPORTS.length} symbols`);

// 2. API_VERSION is a semver string and the ledger schema version is a positive int.
check("API_VERSION is semver", /^\d+\.\d+\.\d+$/.test(api.API_VERSION), api.API_VERSION);
check("LEDGER_SCHEMA_VERSION is a positive int", Number.isInteger(LEDGER_SCHEMA_VERSION) && LEDGER_SCHEMA_VERSION >= 1, String(LEDGER_SCHEMA_VERSION));

// 3. appendLedger stamps the current schema version on every written line.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude0-m16-"));
fs.mkdirSync(path.join(tmp, ".claude0"), { recursive: true });
const baseEntry: LedgerEntry = {
  schema: LEDGER_SCHEMA_VERSION,
  ts: "2026-01-01T00:00:00Z",
  milestone: "M16",
  step: "s",
  attempt: 1,
  tier: "n/a",
  tokens_in: 10,
  tokens_out: 0,
  baseline_tokens: 20,
  pass: true,
  metric: 1,
  outcome: "PASS",
  retries: 0,
  rules_included: [],
  rules_excluded: [],
  note: "",
};
appendLedger(baseEntry, tmp);
const written = JSON.parse(fs.readFileSync(path.join(tmp, ".claude0", "ledger.jsonl"), "utf8").trim());
check("appendLedger stamps schema version", written.schema === LEDGER_SCHEMA_VERSION, `schema=${written.schema}`);

// 4. A pre-v1 ledger line (NO `schema` field) still parses, defaulting to v1 —
//    the backward-compat guarantee. Write a raw legacy line and read it back.
const legacy = { ...baseEntry };
delete (legacy as { schema?: number }).schema;
fs.appendFileSync(path.join(tmp, ".claude0", "ledger.jsonl"), JSON.stringify(legacy) + "\n");
const roundtrip = readLedger(tmp);
check("legacy entry (no schema) parses", roundtrip.length === 2, `${roundtrip.length} entries`);
check("legacy entry defaults to schema v1", roundtrip[1].schema === 1, `schema=${roundtrip[1].schema}`);

// 5. The golden schema shape is exactly what the barrel re-exports (same Zod
//    object) — parsing via api.LedgerEntry must accept the stamped entry.
const parsed = api.LedgerEntry.safeParse(written);
check("barrel LedgerEntry parses a stamped entry", parsed.success);

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\nM16 RESULT: ${fail === 0 ? "PASS" : "FAIL"}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
