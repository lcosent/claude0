import * as fs from "fs";
import * as path from "path";

/**
 * Finds .claude0/ by walking upward from cwd (like git does with .git/).
 * Returns null if not found.
 */
export function findClaudeZeroRoot(startDir = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  // do/while, not while: the original loop exited BEFORE testing the filesystem
  // root, so a project at `/` or `C:\` was never detected.
  for (;;) {
    const candidate = path.join(dir, ".claude0");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return dir;
    }
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}

/**
 * Gets the claude0 root, throwing a helpful error if not initialized.
 */
export function requireClaudeZeroRoot(): string {
  const root = findClaudeZeroRoot();
  if (!root) {
    throw new Error(
      "Not a claude0 repository. Run 'claude0 init' in your project root."
    );
  }
  // Walking upward from a directory under $HOME reaches ~/.claude0 — the GLOBAL
  // install — and returns $HOME as though it were a project. Commands would then
  // read and write shared global state believing it was project-local. Say so.
  const home = process.env.HOME;
  if (home && path.resolve(root) === path.resolve(home)) {
    console.warn(
      `claude0: no project install found; using the GLOBAL install at ${path.join(home, ".claude0")}.\n` +
        `         Run 'claude0 init' inside your project to keep its rules and ledger separate.`
    );
  }
  return root;
}

export function claude0Dir(repoRoot: string): string {
  return path.join(repoRoot, ".claude0");
}

export function rulesDir(repoRoot: string): string {
  return path.join(claude0Dir(repoRoot), "rules");
}

export function ledgerPath(repoRoot: string): string {
  return path.join(claude0Dir(repoRoot), "ledger.jsonl");
}

export function policyPath(repoRoot: string): string {
  return path.join(claude0Dir(repoRoot), "policy.yaml");
}

export function claudeSettingsPath(repoRoot: string): string {
  return path.join(repoRoot, ".claude", "settings.json");
}

/** Where compress-output stashes originals so compression stays reversible. */
export function outputsDir(repoRoot: string): string {
  return path.join(claude0Dir(repoRoot), "outputs");
}

/** Backup of the user's CLAUDE.md, written by `init` before it stubs the file. */
export function claudeMdBackupPath(repoRoot: string): string {
  return path.join(claude0Dir(repoRoot), "CLAUDE.md.backup");
}
