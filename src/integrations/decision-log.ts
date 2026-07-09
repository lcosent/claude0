import { encode } from "gpt-tokenizer";
import { Capability, CapabilityAvailability, CapabilityResult, RepoEnv } from "./types";

// decision-log: append-only record of decisions made during a run (karpathy
// gist inspiration — a persistent, compounding artifact). It APPENDS rather
// than compresses, so it is exempt from net-delta accounting (delta N/A, not
// zero). Fires on gate/verify outcomes in the LOOP, not by tags.

export const decisionLogCapability: Capability = {
  name: "decision-log",
  triggerTags: [], // event-driven (gate/verify), not tag-selected

  availability(_env: RepoEnv): CapabilityAvailability {
    return { status: "native", detail: "native (append-only)" };
  },

  // `input` is the decision text to record. Output echoes it; netDeltaExempt
  // tells the runner not to compute a (meaningless) savings ratio.
  run(input: string, _env: RepoEnv): CapabilityResult {
    return {
      name: "decision-log",
      output: input,
      tokensBefore: encode(input).length,
      tokensAfter: encode(input).length,
      source: "native",
      netDeltaExempt: true,
    };
  },
};
