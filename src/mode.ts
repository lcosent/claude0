import * as fs from "fs";
import * as path from "path";
import { claude0Dir } from "./paths";

export type ClaudeZeroMode = "turnkey" | "expert";

export interface ModeConfig {
  mode: ClaudeZeroMode;
  upgraded_at: string | null;
}

function modePath(root: string): string {
  return path.join(claude0Dir(root), "mode.json");
}

export function readMode(root: string): ModeConfig {
  const p = modePath(root);
  if (!fs.existsSync(p)) {
    // Default to turnkey for backward-compat with existing repos
    return { mode: "turnkey", upgraded_at: null };
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { mode: "turnkey", upgraded_at: null };
  }
}

export function writeMode(root: string, config: ModeConfig): void {
  const p = modePath(root);
  fs.writeFileSync(p, JSON.stringify(config, null, 2));
}

export function upgradeToExpert(root: string): void {
  writeMode(root, { mode: "expert", upgraded_at: new Date().toISOString() });
}

export function downgradeToTurnkey(root: string): void {
  writeMode(root, { mode: "turnkey", upgraded_at: null });
}

export function isExpertMode(root: string): boolean {
  return readMode(root).mode === "expert";
}
