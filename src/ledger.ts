import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { requireClaudeZeroRoot, ledgerPath as getLedgerPath } from "./paths";

/**
 * Public ledger schema version. Bump ONLY on a breaking change to
 * LedgerEntry's shape (a removed/renamed field or a narrowed type). Additive
 * optional fields do NOT bump it — they stay backward-compatible by
 * construction. Entries written before this field existed parse as version 1
 * (see `.default(LEDGER_SCHEMA_VERSION)` below), so old ledgers remain
 * readable. This is the frozen contract the v1 API promises.
 */
export const LEDGER_SCHEMA_VERSION = 1;

export const LedgerEntry = z.object({
  // Schema version stamped at write time. Optional + defaulted so pre-v1
  // ledgers (which lack it) still parse — they're treated as version 1.
  schema: z.number().int().default(LEDGER_SCHEMA_VERSION),
  ts: z.string(),
  milestone: z.string(),
  step: z.string(),
  attempt: z.number().int().min(1),
  tier: z.string().default("n/a"),
  tokens_in: z.number().int().default(0),
  tokens_out: z.number().int().default(0),
  baseline_tokens: z.number().int().default(0),
  pass: z.boolean(),
  metric: z.number(),
  outcome: z.enum(["PASS", "FAIL", "STUCK"]),
  retries: z.number().int().default(0),
  rules_included: z.array(z.string()).default([]),
  rules_excluded: z.array(z.string()).default([]),
  note: z.string().default(""),
  // Reasoning effort for this step (M21). Optional — absent on pre-M21 entries,
  // which keeps old ledgers parseable (additive, no schema bump).
  effort: z.string().optional(),
  // Optional per-capability accounting (M8 integrations). Absent on older
  // entries — optional keeps existing ledgers parseable (backward-compat).
  capabilities: z
    .array(
      z.object({
        name: z.string(),
        tokens_before: z.number().int(),
        tokens_after: z.number().int(),
        source: z.enum(["native", "adapter"]),
        net_delta_exempt: z.boolean().default(false),
      })
    )
    .optional(),
});

export type LedgerEntry = z.infer<typeof LedgerEntry>;

// Construction-time shape: fields with a Zod default (schema, tier, tokens_*,
// etc.) are optional for callers — the default fills them in on write/parse.
// Readers get the fully-resolved `LedgerEntry` (output) type back.
export type LedgerEntryInput = z.input<typeof LedgerEntry>;

export function appendLedger(entry: LedgerEntryInput, repoRoot?: string): void {
  const root = repoRoot ?? requireClaudeZeroRoot();
  const ledgerFile = getLedgerPath(root);
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
  // Stamp the current schema version unless the caller set one explicitly, so
  // every written line is self-describing for future migrations.
  const stamped = { schema: LEDGER_SCHEMA_VERSION, ...entry };
  fs.appendFileSync(ledgerFile, JSON.stringify(stamped) + "\n");
}

export function readLedger(repoRoot?: string): LedgerEntry[] {
  const root = repoRoot ?? requireClaudeZeroRoot();
  const ledgerFile = getLedgerPath(root);
  if (!fs.existsSync(ledgerFile)) return [];
  const entries: LedgerEntry[] = [];
  for (const line of fs.readFileSync(ledgerFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(LedgerEntry.parse(JSON.parse(line)));
    } catch {
      // Skip malformed/truncated lines (e.g. from a concurrent writer) rather
      // than crash the whole ledger read, but surface it — silent drops are
      // exactly what the ledger exists to make auditable.
      console.warn(`readLedger: skipping malformed line: ${line.slice(0, 120)}`);
    }
  }
  return entries;
}

export function ledgerTail(n = 1, repoRoot?: string): LedgerEntry[] {
  const all = readLedger(repoRoot);
  return all.slice(-n);
}
