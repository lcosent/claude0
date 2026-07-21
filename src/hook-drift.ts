import * as fs from "fs";
import * as path from "path";
import { claudeSettingsPath } from "./paths";
import {
  HOOK_EVENT,
  HOOK_COMMAND,
  POST_TOOL_EVENT,
  POST_TOOL_COMMAND,
  POST_TOOL_MATCHER,
} from "./init-templates";

/**
 * A hook claude0 owns. `matcher` is undefined for events we register
 * unconditionally (UserPromptSubmit has no tool to match on).
 */
export interface OwnedHook {
  event: string;
  command: string;
  matcher?: string;
  label: string;
}

/**
 * The hooks a current claude0 install is supposed to have. Adding an entry here
 * is what makes `doctor` report drift and `upgrade` repair it on installs that
 * were created before the hook existed — `init` short-circuits on an existing
 * .claude0/, so it can never backfill them.
 */
export const OWNED_HOOKS: OwnedHook[] = [
  {
    event: HOOK_EVENT,
    command: HOOK_COMMAND,
    label: "rule injection",
  },
  {
    event: POST_TOOL_EVENT,
    command: POST_TOOL_COMMAND,
    matcher: POST_TOOL_MATCHER,
    label: "output compression",
  },
];

export interface HookDrift {
  present: OwnedHook[];
  missing: OwnedHook[];
  /** True when settings.json exists but could not be parsed. */
  unreadable: boolean;
}

function readSettings(root: string): { settings: any; unreadable: boolean } {
  const file = claudeSettingsPath(root);
  if (!fs.existsSync(file)) return { settings: {}, unreadable: false };
  try {
    return { settings: JSON.parse(fs.readFileSync(file, "utf8")), unreadable: false };
  } catch {
    // Malformed JSON. Report it rather than silently overwriting the user's
    // file — upgrade refuses to touch settings it cannot understand.
    return { settings: {}, unreadable: true };
  }
}

function hasHook(settings: any, hook: OwnedHook): boolean {
  const entries = settings.hooks?.[hook.event];
  if (!Array.isArray(entries)) return false;
  return entries.some((group: any) =>
    (group?.hooks ?? []).some((h: any) => h?.command === hook.command)
  );
}

export function detectHookDrift(root: string): HookDrift {
  const { settings, unreadable } = readSettings(root);
  const present: OwnedHook[] = [];
  const missing: OwnedHook[] = [];
  for (const hook of OWNED_HOOKS) {
    (hasHook(settings, hook) ? present : missing).push(hook);
  }
  return { present, missing, unreadable };
}

export interface ReconcileResult {
  added: OwnedHook[];
  unreadable: boolean;
}

/**
 * Adds any missing claude0 hooks to .claude/settings.json, leaving every other
 * hook alone. Unlike `init`'s object spread, this appends to an existing event
 * array instead of replacing it, so user-registered hooks on UserPromptSubmit
 * or PostToolUse survive an upgrade.
 */
export function reconcileHooks(root: string): ReconcileResult {
  const drift = detectHookDrift(root);
  if (drift.unreadable) return { added: [], unreadable: true };
  if (drift.missing.length === 0) return { added: [], unreadable: false };

  const { settings } = readSettings(root);
  settings.hooks = settings.hooks ?? {};

  for (const hook of drift.missing) {
    const entries = Array.isArray(settings.hooks[hook.event])
      ? settings.hooks[hook.event]
      : [];
    const group: any = { hooks: [{ type: "command", command: hook.command }] };
    if (hook.matcher !== undefined) group.matcher = hook.matcher;
    settings.hooks[hook.event] = [...entries, group];
  }

  const file = claudeSettingsPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));

  return { added: drift.missing, unreadable: false };
}
