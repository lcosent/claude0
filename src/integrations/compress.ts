import { execFileSync } from "child_process";
import { encode } from "gpt-tokenizer";
import { Capability, CapabilityAvailability, CapabilityResult, RepoEnv } from "./types";

// output-compress: shrink verbose command output before it reaches the model.
// Native reimplementation of rtk's four heuristics; uses the rtk binary as an
// accelerator when it's on PATH. Runs both on the internal LOOP's command output
// and on real user Bash output via the PostToolUse hook (see compress-output.ts).

function dedupe(lines: string[]): string[] {
  // Collapse consecutive identical lines into "line  (xN)".
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    let count = 1;
    while (i + count < lines.length && lines[i + count] === lines[i]) count++;
    out.push(count > 1 ? `${lines[i]}  (x${count})` : lines[i]);
    i += count;
  }
  return out;
}

function filterNoise(lines: string[]): string[] {
  // Drop blank runs and common progress/noise chatter.
  const noise = /^\s*$|^\s*(Downloading|Fetching|Resolving|\d+%|\[=*>?\s*\])/;
  const out: string[] = [];
  let lastBlank = false;
  for (const l of lines) {
    const blank = l.trim() === "";
    if (blank && lastBlank) continue; // squeeze blank runs
    lastBlank = blank;
    if (!blank && noise.test(l)) continue;
    out.push(l);
  }
  return out;
}

// Lines that carry the signal a model actually needs: errors, failures, stack
// frames, assertions. Blind head/tail truncation elides exactly these when they
// land in the middle of long output (e.g. the one failing assertion in a 2000-
// line test run), which is the worst possible thing to drop. So we always retain
// them regardless of position.
// Matched case-insensitively as substrings, not whole words: real diagnostics
// arrive as CamelCase (AssertionError, TypeError) and multi-word markers ("not
// ok"), which \b-anchored patterns miss. A false positive only keeps one extra
// line; a false negative drops the exact line the model needed — so we bias
// hard toward keeping. Plus stack-frame shapes (JS "at x:1:2", Python 'File …').
const SALIENT =
  /error|errno|exception|traceback|fail|assert|panic|fatal|segfault|core dumped|unhandled|rejected|denied|refused|not ok|✗|✖|❌|^\s*at\s+.+:\d+(?::\d+)?\)?\s*$|^\s*File ".+", line \d+/i;

// How many salient lines to keep before we stop protecting them. A wall of
// errors is still bounded; upstream dedupe/filter has already collapsed repeats.
const SALIENT_CAP = 200;
// Lines of context kept immediately around each salient line.
const SALIENT_CONTEXT = 1;

function elideMiddle(lines: string[], keep = 40): string[] {
  // Keep head + tail for orientation, always keep salient lines (with a little
  // context) wherever they are, and collapse only the low-value runs between.
  // With no salient middle lines this reduces exactly to the old head/tail form.
  if (lines.length <= keep) return lines;

  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  const keepIdx = new Set<number>();

  for (let i = 0; i < head; i++) keepIdx.add(i);
  for (let i = lines.length - tail; i < lines.length; i++) keepIdx.add(i);

  let salientKept = 0;
  for (let i = 0; i < lines.length && salientKept < SALIENT_CAP; i++) {
    if (!SALIENT.test(lines[i])) continue;
    salientKept++;
    const from = Math.max(0, i - SALIENT_CONTEXT);
    const to = Math.min(lines.length - 1, i + SALIENT_CONTEXT);
    for (let j = from; j <= to; j++) keepIdx.add(j);
  }

  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (keepIdx.has(i)) {
      out.push(lines[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && !keepIdx.has(j)) j++;
    out.push(`… (${j - i} lines elided by claude0) …`);
    i = j;
  }
  return out;
}

/** Native compression: filter → dedupe → salience-aware elision. Deterministic. */
export function compressNative(text: string): string {
  const lines = text.split("\n");
  return elideMiddle(dedupe(filterNoise(lines))).join("\n");
}

/** Accelerator: pipe through rtk if present. Falls back to native on any error. */
function compressViaRtk(text: string): string | null {
  try {
    return execFileSync("rtk", ["proxy", "cat"], {
      input: text,
      encoding: "utf8",
      timeout: 5000,
    });
  } catch {
    return null; // binary missing/renamed/errored → caller uses native
  }
}

export const compressCapability: Capability = {
  name: "output-compress",
  triggerTags: [], // selected when a step runs a shell command, not by tags

  availability(env: RepoEnv): CapabilityAvailability {
    if (env.rtkOnPath) {
      return {
        status: "accelerated",
        detail: "native + rtk (accelerator)",
        accelerator: "rtk",
      };
    }
    return { status: "native", detail: "native (filter/dedupe/salience-elide)" };
  },

  run(input: string, env: RepoEnv): CapabilityResult {
    const tokensBefore = encode(input).length;
    let output: string;
    let source: "native" | "adapter" = "native";

    if (env.rtkOnPath) {
      const viaRtk = compressViaRtk(input);
      if (viaRtk !== null) {
        output = viaRtk;
        source = "adapter";
      } else {
        output = compressNative(input);
      }
    } else {
      output = compressNative(input);
    }

    return {
      name: "output-compress",
      output,
      tokensBefore,
      tokensAfter: encode(output).length,
      source,
    };
  },
};
