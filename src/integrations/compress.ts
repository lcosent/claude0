import { execFileSync } from "child_process";
import { encode } from "gpt-tokenizer";
import { Capability, CapabilityAvailability, CapabilityResult, RepoEnv } from "./types";

// output-compress: shrink verbose command output before it reaches the model.
// Native reimplementation of rtk's four heuristics; uses the rtk binary as an
// accelerator when it's on PATH. Applies to the internal LOOP's command output
// in M8 (real user Bash output via PostToolUse is deferred — see plan).

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

function truncateMiddle(lines: string[], keep = 40): string[] {
  // Keep head + tail, elide the middle of very long output.
  if (lines.length <= keep) return lines;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return [
    ...lines.slice(0, head),
    `… (${lines.length - keep} lines elided by claude0) …`,
    ...lines.slice(lines.length - tail),
  ];
}

/** Native compression: filter → dedupe → truncate. Deterministic. */
export function compressNative(text: string): string {
  const lines = text.split("\n");
  return truncateMiddle(dedupe(filterNoise(lines))).join("\n");
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
    return { status: "native", detail: "native (filter/dedupe/truncate)" };
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
