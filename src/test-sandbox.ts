import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Test sandboxing helpers.
 *
 * Several milestone tests used `process.cwd()` as their repo root, which meant
 * `npm test` truncated and appended to the DEVELOPER'S real
 * `.claude0/ledger.jsonl` — the file that holds their actual savings history,
 * gitignored and therefore unrecoverable. Every test that touches ledger or
 * rules state must go through here instead.
 */

/** Creates an isolated repo root with a `.claude0/` dir. */
export function makeSandbox(label: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `claude0-${label}-`));
  fs.mkdirSync(path.join(root, ".claude0", "rules"), { recursive: true });
  return root;
}

/**
 * Copies the real project's rules into a sandbox. Tests that measure realistic
 * compression ratios need the actual rule corpus, but must not write beside it.
 */
export function copyRealRules(root: string, fromRepo = process.cwd()): number {
  const src = path.join(fromRepo, ".claude0", "rules");
  const dest = path.join(root, ".claude0", "rules");
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let copied = 0;
  for (const f of fs.readdirSync(src)) {
    if (!f.endsWith(".md")) continue;
    fs.copyFileSync(path.join(src, f), path.join(dest, f));
    copied++;
  }
  return copied;
}

/** Runs `fn` with cwd set to `root`, always restoring the previous cwd. */
export function withCwd<T>(root: string, fn: () => T): T {
  const prev = process.cwd();
  process.chdir(root);
  try {
    return fn();
  } finally {
    process.chdir(prev);
  }
}
