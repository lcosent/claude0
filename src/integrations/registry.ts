import { Capability, RepoEnv } from "./types";
import { compressCapability } from "./compress";
import { symbolCapability } from "./symbols";
import { docsCapability } from "./docs";
import { terseCapability } from "./terse";
import { decisionLogCapability } from "./decision-log";

// All native capabilities. Order is display order for `claude0 doctor`.
export const CAPABILITIES: Capability[] = [
  compressCapability,
  terseCapability,
  symbolCapability,
  docsCapability,
  decisionLogCapability,
];

export function getCapability(name: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.name === name);
}

/**
 * Automatic selection — the user never picks. A capability is selected when any
 * of its triggerTags is present AND it is available in this repo (not inactive/
 * disabled). Event-driven capabilities (empty triggerTags: terse, compress,
 * decision-log) are invoked directly by the pipe/loop, not via tag selection.
 */
export function selectCapabilities(stepTags: string[], env: RepoEnv): Capability[] {
  return CAPABILITIES.filter((c) => {
    if (c.triggerTags.length === 0) return false; // event-driven, not tag-selected
    const tagHit = c.triggerTags.some((t) => stepTags.includes(t));
    if (!tagHit) return false;
    const status = c.availability(env).status;
    return status === "native" || status === "accelerated";
  });
}
