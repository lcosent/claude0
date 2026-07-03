import * as fs from "fs";
import * as path from "path";

/**
 * Finds .harness/ by walking upward from cwd (like git does with .git/).
 * Returns null if not found.
 */
export function findHarnessRoot(startDir = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (dir !== root) {
    const candidate = path.join(dir, ".harness");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Gets the harness root, throwing a helpful error if not initialized.
 */
export function requireHarnessRoot(): string {
  const root = findHarnessRoot();
  if (!root) {
    throw new Error(
      "Not a harness repository. Run 'harness init' in your project root."
    );
  }
  return root;
}

export function harnessDir(repoRoot: string): string {
  return path.join(repoRoot, ".harness");
}

export function rulesDir(repoRoot: string): string {
  return path.join(harnessDir(repoRoot), "rules");
}

export function ledgerPath(repoRoot: string): string {
  return path.join(harnessDir(repoRoot), "ledger.jsonl");
}

export function policyPath(repoRoot: string): string {
  return path.join(harnessDir(repoRoot), "policy.yaml");
}

export function claudeSettingsPath(repoRoot: string): string {
  return path.join(repoRoot, ".claude", "settings.json");
}
