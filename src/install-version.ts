import * as fs from "fs";
import * as path from "path";
import { claude0Dir } from "./paths";

/**
 * Records which claude0 version created or last upgraded an install.
 *
 * Without this stamp there was no way for `upgrade` to know what it was
 * upgrading FROM, so it could only reconcile hooks — a change to rule format or
 * policy schema in a later release would silently mis-parse an old install.
 * The stamp is what makes ordered migrations possible.
 */

export interface InstallVersion {
  version: string;
  initialized_at: string;
  upgraded_at: string | null;
}

/** The running package's version, read from package.json at runtime. */
export function packageVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
    );
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function versionFile(repoRoot: string): string {
  return path.join(claude0Dir(repoRoot), "version.json");
}

export function readInstallVersion(repoRoot: string): InstallVersion | null {
  try {
    const raw = fs.readFileSync(versionFile(repoRoot), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.version === "string") return parsed;
    return null;
  } catch {
    // Missing or malformed: treat as an unstamped (pre-versioning) install.
    return null;
  }
}

export function writeInstallVersion(repoRoot: string, v: InstallVersion): void {
  const file = versionFile(repoRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(v, null, 2) + "\n");
}

export function stampInit(repoRoot: string): void {
  writeInstallVersion(repoRoot, {
    version: packageVersion(),
    initialized_at: new Date().toISOString(),
    upgraded_at: null,
  });
}

export function stampUpgrade(repoRoot: string): void {
  const prev = readInstallVersion(repoRoot);
  writeInstallVersion(repoRoot, {
    version: packageVersion(),
    initialized_at: prev?.initialized_at ?? new Date().toISOString(),
    upgraded_at: new Date().toISOString(),
  });
}

/** Compares dotted numeric versions. Returns <0, 0, >0 like a comparator. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export interface Migration {
  /** Runs when the install's stamped version is OLDER than this. */
  version: string;
  describe: string;
  run: (repoRoot: string) => void;
}

/**
 * Ordered state migrations, oldest first. Each must be idempotent: `upgrade`
 * may run more than once, and an unstamped install runs the whole chain.
 *
 * Hook reconciliation is deliberately NOT here — it runs unconditionally on
 * every upgrade, because hook drift can happen without a version change.
 */
export const MIGRATIONS: Migration[] = [];

export function pendingMigrations(repoRoot: string): Migration[] {
  const stamped = readInstallVersion(repoRoot)?.version;
  // An unstamped install predates versioning: every migration is pending.
  if (!stamped) return [...MIGRATIONS];
  return MIGRATIONS.filter((m) => compareVersions(stamped, m.version) < 0);
}
