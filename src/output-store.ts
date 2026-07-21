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
// A file-count cap alone does not bound disk: 50 stashes of `find /` output is
// hundreds of MB. Bound the directory by bytes too, and truncate any single
// stash that is pathologically large (still recoverable, just marked).
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_STASH_BYTES = 4 * 1024 * 1024;
const TRUNCATION_NOTE =
  "\n\n[claude0: original exceeded the per-stash size limit and was truncated here.]\n";
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
      .map((f) => {
        const s = fs.statSync(path.join(dir, f));
        return { f, m: s.mtimeMs, size: s.size };
      })
      .sort((a, b) => b.m - a.m);

    let kept = 0;
    let bytes = 0;
    for (const { f, size } of files) {
      kept++;
      bytes += size;
      if (kept > keep || bytes > MAX_TOTAL_BYTES) {
        fs.unlinkSync(path.join(dir, f));
      }
    }
  } catch {
    // best-effort — a prune failure must never break the tool pipeline
  }
}

/** Persists the original output; returns the id used to recall it. */
export function stashOutput(original: string, repoRoot: string): string {
  const dir = outputsDir(repoRoot);
  fs.mkdirSync(dir, { recursive: true });
  // The id always hashes the FULL original, so a truncated stash still recalls
  // under the id the banner advertises.
  const id = outputId(original);
  const body =
    Buffer.byteLength(original, "utf8") > MAX_STASH_BYTES
      ? original.slice(0, MAX_STASH_BYTES) + TRUNCATION_NOTE
      : original;

  // Write to a unique temp file then rename. Parallel Bash tool calls mean
  // concurrent compress-output processes: a plain writeFileSync lets a reader
  // observe a half-written file, and rename() is atomic on POSIX and Windows.
  const finalPath = path.join(dir, `${id}.txt`);
  const tmpPath = path.join(dir, `.${id}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(tmpPath, body);
    fs.renameSync(tmpPath, finalPath);
  } catch {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // ignore
    }
    throw new Error("stash failed");
  }
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
