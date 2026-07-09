import * as fs from "fs";
import * as path from "path";

/**
 * Finds .claude0/ by walking upward from cwd (like git does with .git/).
 * Returns null if not found.
 */
export function findClaudeZeroRoot(startDir = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (dir !== root) {
    const candidate = path.join(dir, ".claude0");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
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
