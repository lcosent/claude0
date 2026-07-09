import { encode } from "gpt-tokenizer";
import { Capability, CapabilityAvailability, CapabilityResult, RepoEnv } from "./types";

// terse-output: prepend a compact system-prompt fragment that tells the model
// to drop conversational filler and return dense, code-first output. Pure
// native reimplementation (caveman-inspired, MIT). It shapes model OUTPUT, so
// its TRUE net delta needs real model calls to measure — applied in M8, but its
// auto-disable decision is deferred to the real-LLM milestone (see plan).

export const TERSE_FRAGMENT =
  "Output style: be terse and code-first. Skip preamble, restatement, and " +
  "pleasantries. Prefer diffs and code blocks over prose. State assumptions " +
  "in one line. Do not explain what the code does unless asked.";

export const terseCapability: Capability = {
  name: "terse-output",
  triggerTags: [], // applied on every model-prompt build (event-driven)

  availability(_env: RepoEnv): CapabilityAvailability {
    return { status: "native", detail: "native (prompt fragment)" };
  },

  // `input` is the prompt/system text to prepend to. Output is input + fragment.
  run(input: string, _env: RepoEnv): CapabilityResult {
    const output = input ? `${TERSE_FRAGMENT}\n\n${input}` : TERSE_FRAGMENT;
    return {
      name: "terse-output",
      output,
      tokensBefore: encode(input).length,
      tokensAfter: encode(output).length,
      source: "native",
    };
  },
};
