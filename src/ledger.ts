import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { requireHarnessRoot, ledgerPath as getLedgerPath } from "./paths";

export const LedgerEntry = z.object({
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
});

export type LedgerEntry = z.infer<typeof LedgerEntry>;

export function appendLedger(entry: LedgerEntry, repoRoot?: string): void {
  const root = repoRoot ?? requireHarnessRoot();
  const ledgerFile = getLedgerPath(root);
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
  fs.appendFileSync(ledgerFile, JSON.stringify(entry) + "\n");
}

export function readLedger(repoRoot?: string): LedgerEntry[] {
  const root = repoRoot ?? requireHarnessRoot();
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
