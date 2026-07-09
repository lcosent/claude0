import * as fs from "fs";
import * as path from "path";
import { RepoEnv } from "./types";

// Centralized repo/environment detection (eng-review Issue 2 decision:
// centralize rather than have each capability re-probe). Probed once per
// process and cached — a CLI invocation resolves these facts a single time.

const cache = new Map<string, RepoEnv>();

/** Does a Claude MCP config mention the given server name anywhere? */
function mcpConfigured(repoRoot: string, serverNeedle: string): boolean {
  // Check both the project-local and user-level Claude config, best-effort.
  const candidates = [
    path.join(repoRoot, ".mcp.json"),
    path.join(repoRoot, ".claude", "settings.json"),
    path.join(process.env.HOME || "", ".claude.json"),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, "utf8");
      if (text.toLowerCase().includes(serverNeedle.toLowerCase())) return true;
    } catch {
      // unreadable/malformed config never throws — just treat as "not configured"
    }
  }
  return false;
}

/**
 * Is gstack (the orchestration skill suite) installed for this user? gstack is
 * an ORCHESTRATION LAYER, not a token-compression capability — claude0 never
 * invokes it, only detects it so `claude0 doctor` can surface "orchestration
 * leaves available". Honest degradation: absent → doctor says so, nothing
 * breaks. Probed at the conventional install path (`~/.claude/skills/gstack`),
 * overridable via $GSTACK_HOME for non-standard installs.
 */
function gstackInstalled(): boolean {
  const candidates = [
    process.env.GSTACK_HOME,
    path.join(process.env.HOME || "", ".claude", "skills", "gstack"),
  ].filter((p): p is string => !!p);
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return true;
    } catch {
      // unreadable path → treat as not installed
    }
  }
  return false;
}

/** Is a binary resolvable on PATH? Walks $PATH entries — no shell, no interp. */
function onPath(bin: string): boolean {
  const dirs = (process.env.PATH || "").split(path.delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = path.join(dir, bin);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      // not here / not executable — keep looking
    }
  }
  return false;
}

export function detectRepoEnv(repoRoot: string): RepoEnv {
  const cached = cache.get(repoRoot);
  if (cached) return cached;

  const env: RepoEnv = {
    repoRoot,
    hasTsconfig: fs.existsSync(path.join(repoRoot, "tsconfig.json")),
    hasNodeModules: fs.existsSync(path.join(repoRoot, "node_modules")),
    rtkOnPath: onPath("rtk"),
    context7Configured: mcpConfigured(repoRoot, "context7"),
    lspMcpConfigured:
      mcpConfigured(repoRoot, "lsp-mcp") || mcpConfigured(repoRoot, "lsp"),
    gstackInstalled: gstackInstalled(),
  };

  cache.set(repoRoot, env);
  return env;
}

/** Test seam: clear the per-process cache (e.g. between fixture repos in tests). */
export function clearDetectCache(): void {
  cache.clear();
}
