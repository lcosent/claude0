import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { detectHookDrift, reconcileHooks, OWNED_HOOKS } from "./hook-drift";
import { claudeSettingsPath } from "./paths";
import { HOOK_EVENT, HOOK_COMMAND, POST_TOOL_EVENT, POST_TOOL_COMMAND } from "./init-templates";
import {
  readInstallVersion,
  stampInit,
  stampUpgrade,
  pendingMigrations,
  packageVersion,
  compareVersions,
  MIGRATIONS,
} from "./install-version";

// M26 — upgrade path for existing installs.
//
// `init` exits early when .claude0/ already exists, so it can never backfill a
// hook added in a later release. Anyone who installed before the PostToolUse
// compression hook landed would upgrade the npm package and silently get no
// compression. `doctor` must see that, and `upgrade` must fix it without
// disturbing hooks the user registered themselves.

function main() {
  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
    ok ? pass++ : fail++;
  };

  const mkRepo = (settings?: any): string => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude0-m26-"));
    fs.mkdirSync(path.join(tmp, ".claude0"), { recursive: true });
    if (settings !== undefined) {
      fs.mkdirSync(path.join(tmp, ".claude"), { recursive: true });
      fs.writeFileSync(
        claudeSettingsPath(tmp),
        typeof settings === "string" ? settings : JSON.stringify(settings, null, 2)
      );
    }
    return tmp;
  };
  const readSettings = (root: string) =>
    JSON.parse(fs.readFileSync(claudeSettingsPath(root), "utf8"));

  // ---- Detection -----------------------------------------------------------

  const fresh = mkRepo();
  check(
    "drift: no settings.json → every owned hook reported missing",
    detectHookDrift(fresh).missing.length === OWNED_HOOKS.length
  );

  // The exact shape a pre-compression install has: intercept only.
  const legacy = mkRepo({
    hooks: { [HOOK_EVENT]: [{ hooks: [{ type: "command", command: HOOK_COMMAND }] }] },
  });
  const legacyDrift = detectHookDrift(legacy);
  check(
    "drift: legacy install → intercept present, compression missing",
    legacyDrift.present.length === 1 &&
      legacyDrift.present[0].command === HOOK_COMMAND &&
      legacyDrift.missing.length === 1 &&
      legacyDrift.missing[0].command === POST_TOOL_COMMAND
  );

  const malformed = mkRepo("{ not json");
  check("drift: malformed settings.json is reported, not swallowed", detectHookDrift(malformed).unreadable);

  // ---- Reconciliation ------------------------------------------------------

  const added = reconcileHooks(legacy);
  check(
    "upgrade: adds exactly the missing hook",
    added.added.length === 1 && added.added[0].command === POST_TOOL_COMMAND
  );
  check("upgrade: install is clean afterward", detectHookDrift(legacy).missing.length === 0);
  check(
    "upgrade: is idempotent (second run adds nothing)",
    reconcileHooks(legacy).added.length === 0
  );
  check(
    "upgrade: added PostToolUse entry carries the Bash matcher",
    readSettings(legacy).hooks[POST_TOOL_EVENT][0].matcher === "Bash"
  );

  // The regression that matters most: init's object-spread merge replaces the
  // whole event array. Upgrade must append instead, or it eats user hooks.
  const withUserHooks = mkRepo({
    hooks: {
      [HOOK_EVENT]: [{ hooks: [{ type: "command", command: HOOK_COMMAND }] }],
      [POST_TOOL_EVENT]: [{ matcher: "Bash", hooks: [{ type: "command", command: "my-own-linter" }] }],
    },
    permissions: { allow: ["Bash(ls:*)"] },
  });
  reconcileHooks(withUserHooks);
  const merged = readSettings(withUserHooks);
  const postCommands = merged.hooks[POST_TOOL_EVENT].flatMap((g: any) =>
    g.hooks.map((h: any) => h.command)
  );
  check(
    "upgrade: preserves a user hook on the same event",
    postCommands.includes("my-own-linter") && postCommands.includes(POST_TOOL_COMMAND)
  );
  check(
    "upgrade: leaves unrelated settings untouched",
    JSON.stringify(merged.permissions) === JSON.stringify({ allow: ["Bash(ls:*)"] })
  );

  check(
    "upgrade: refuses to write over malformed settings.json",
    reconcileHooks(malformed).unreadable === true &&
      fs.readFileSync(claudeSettingsPath(malformed), "utf8") === "{ not json"
  );

  // A fresh install with no settings.json at all should end up fully wired.
  reconcileHooks(fresh);
  check("upgrade: creates settings.json when absent", detectHookDrift(fresh).missing.length === 0);

  // ---- Version stamping ----------------------------------------------------

  const versioned = mkRepo();
  check("version: an unstamped install reads as null", readInstallVersion(versioned) === null);
  check(
    "version: unstamped install has every migration pending",
    pendingMigrations(versioned).length === MIGRATIONS.length
  );

  stampInit(versioned);
  const stamped = readInstallVersion(versioned);
  check(
    "version: init stamps the running package version",
    stamped?.version === packageVersion() && stamped?.upgraded_at === null
  );
  check("version: a current install has no pending migrations", pendingMigrations(versioned).length === 0);

  stampUpgrade(versioned);
  const upgraded = readInstallVersion(versioned);
  check(
    "version: upgrade records upgraded_at but preserves initialized_at",
    !!upgraded?.upgraded_at && upgraded?.initialized_at === stamped?.initialized_at
  );

  check(
    "version: compareVersions orders numerically, not lexically",
    compareVersions("1.9.0", "1.10.0") < 0 &&
      compareVersions("2.0.0", "1.99.99") > 0 &&
      compareVersions("1.1.0", "1.1.0") === 0
  );

  console.log("---");
  console.log(`M26 RESULT: ${fail === 0 ? "PASS" : "FAIL"}  (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
