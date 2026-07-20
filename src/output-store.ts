import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { outputsDir } from "./paths";

// Reversible compression: before compress-output shrinks a tool result, it
// stashes the full original here and leaves the model a `claude0 recall <id>`
// affordance. Salience-aware elision keeps the important lines, but a stash
// guarantees nothing is ever unrecoverably lost — the headroom CCR idea.

// Cap on stored originals; oldest are pruned so .claude0/outputs/ stays bounded.
const KEEP_RECENT = 50;
// Ids are content hashes, so they're valid file-name atoms; reject anything else
// (recall's id comes from a CLI arg — never let it escape the outputs dir).
const ID_RE = /^[a-f0-9]{6,40}$/;

/** Deterministic id for a piece of output (same content → same id). */
export function outputId(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 12);
}

function pruneOldest(dir: string, keep: number): void {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".txt"))
      .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    for (const { f } of files.slice(keep)) {
      fs.unlinkSync(path.join(dir, f));
    }
  } catch {
    // best-effort — a prune failure must never break the tool pipeline
  }
}

/** Persists the original output; returns the id used to recall it. */
export function stashOutput(original: string, repoRoot: string): string {
  const dir = outputsDir(repoRoot);
  fs.mkdirSync(dir, { recursive: true });
  const id = outputId(original);
  fs.writeFileSync(path.join(dir, `${id}.txt`), original);
  pruneOldest(dir, KEEP_RECENT);
  return id;
}

/** Reads back a stashed original, or null if the id is unknown/invalid. */
export function recallOutput(id: string, repoRoot: string): string | null {
  if (!ID_RE.test(id)) return null;
  const file = path.join(outputsDir(repoRoot), `${id}.txt`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}
