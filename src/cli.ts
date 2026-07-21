#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import {
  findClaudeZeroRoot,
  requireClaudeZeroRoot,
  claude0Dir,
  rulesDir,
  policyPath,
  claudeSettingsPath,
  claudeMdBackupPath,
} from "./paths";
import {
  SAMPLE_RULES,
  DEFAULT_POLICY,
  TURNKEY_POLICY,
  EXPERT_POLICY,
  CLAUDE_MD_STUB,
  HOOK_CONFIG,
  HOOK_EVENT,
  HOOK_COMMAND,
  POST_TOOL_EVENT,
  POST_TOOL_COMMAND,
  README,
} from "./init-templates";
import { migrateContent, renderRuleFile } from "./migrate";
import { detectHookDrift, reconcileHooks } from "./hook-drift";
import {
  stampInit,
  stampUpgrade,
  readInstallVersion,
  pendingMigrations,
  packageVersion,
} from "./install-version";
import { recallOutput } from "./output-store";
import { readMode, writeMode, upgradeToExpert, downgradeToTurnkey, isExpertMode } from "./mode";
import { interceptFromStdin } from "./intercept";
import { compressOutputFromStdin } from "./compress-output";
import { pushPolicy, pullPolicy, centralPolicyPath } from "./policy-sync";
import { proposeChanges, renderProposals } from "./learn";
import { CAPABILITIES, detectRepoEnv, resolveAvailability } from "./integrations";
import { readLedger } from "./ledger";
import { buildReport, detectRegression } from "./report";
import { compile, fullContextBundle, tokenCount } from "./compiler";
import { printBloatReport, autoFixBloat } from "./bloat-detector";

function initCommand(opts: { global?: boolean; expert?: boolean } = {}) {
  const targetDir = opts.global
    ? path.join(process.env.HOME || "~", ".claude0")
    : process.cwd();

  const claude0DirPath = opts.global ? targetDir : claude0Dir(targetDir);
  const rulesDirPath = opts.global
    ? path.join(targetDir, "rules")
    : rulesDir(targetDir);

  // An existing install used to make init exit immediately, which meant a
  // partial or damaged install (deleted policy.yaml, missing ledger, crashed
  // first run) could never be repaired — and `upgrade` only handles hooks.
  // Repair what's missing instead, and never overwrite what's already there.
  const repairing = fs.existsSync(claude0DirPath);
  const repaired: string[] = [];

  // findClaudeZeroRoot walks upward, so initializing inside an already-managed
  // repo creates a nested install that silently shadows the parent for every
  // hook invocation below this directory.
  if (!repairing && !opts.global) {
    const enclosing = findClaudeZeroRoot(path.dirname(targetDir));
    if (enclosing) {
      console.error(`Refusing to nest: ${enclosing} is already a claude0 project.`);
      console.error(`A nested install would shadow it for everything under ${targetDir}.`);
      console.error(`Run 'claude0 init' from ${enclosing}, or remove that install first.`);
      process.exit(1);
    }
  }

  const mode = opts.expert ? "expert" : "turnkey";

  // Create directory structure
  fs.mkdirSync(claude0DirPath, { recursive: true });
  fs.mkdirSync(rulesDirPath, { recursive: true });

  // Migrate an existing CLAUDE.md into tagged rules if there is one. This is
  // what makes the savings real: without it, claude0 would ADD sample rules on
  // top of a CLAUDE.md that Claude Code still reads in full every prompt. After
  // migration, the full file no longer loads each turn and the ledger baseline
  // (full rule set) reflects the user's real content, not claude0's invention.
  let migratedCount = 0;
  const claudeMdPath = !opts.global ? path.join(targetDir, "CLAUDE.md") : "";
  const existingMd =
    claudeMdPath && fs.existsSync(claudeMdPath)
      ? fs.readFileSync(claudeMdPath, "utf8")
      : "";

  // Migration runs only on a first init. On a repair the rules directory is the
  // user's own edited content — re-splitting CLAUDE.md (already a stub) would
  // overwrite it, and re-backing-up the stub would destroy the real backup.
  const hasRules =
    fs.existsSync(rulesDirPath) && fs.readdirSync(rulesDirPath).some((f) => f.endsWith(".md"));

  if (!hasRules) {
    if (existingMd.trim()) {
      // Back up the original BEFORE writing anything, then split into rules.
      fs.writeFileSync(claudeMdBackupPath(targetDir), existingMd);
      for (const rule of migrateContent(existingMd)) {
        fs.writeFileSync(path.join(rulesDirPath, rule.file), renderRuleFile(rule));
        migratedCount++;
      }
      // Stub the file so Claude Code stops reading the full rule set every prompt.
      fs.writeFileSync(claudeMdPath, CLAUDE_MD_STUB);
    } else {
      // Fresh project with no CLAUDE.md — seed starter rules the user can edit.
      for (const [filename, content] of Object.entries(SAMPLE_RULES)) {
        fs.writeFileSync(path.join(rulesDirPath, filename), content);
      }
    }
    if (repairing) repaired.push(".claude0/rules/");
  }

  // Each remaining artifact is created only if absent, so a repair restores what
  // was deleted without discarding tuned policy, recorded history, or mode.
  const policyFile = opts.global
    ? path.join(targetDir, "policy.yaml")
    : policyPath(targetDir);
  if (!fs.existsSync(policyFile)) {
    fs.writeFileSync(policyFile, opts.expert ? EXPERT_POLICY : TURNKEY_POLICY);
    if (repairing) repaired.push(".claude0/policy.yaml");
  }

  if (!opts.global) {
    const modeFile = path.join(claude0DirPath, "mode.json");
    if (!fs.existsSync(modeFile)) {
      writeMode(targetDir, { mode, upgraded_at: null });
      if (repairing) repaired.push(".claude0/mode.json");
    }
    // Stamp the creating version so `upgrade` knows what it is upgrading from.
    if (!readInstallVersion(targetDir)) {
      stampInit(targetDir);
      if (repairing) repaired.push(".claude0/version.json");
    }
  } else {
    // Global installs get a mode file too — its absence made readMode silently
    // fall back to turnkey, so `init --global --expert` was quietly ignored.
    const globalMode = path.join(targetDir, "mode.json");
    if (!fs.existsSync(globalMode)) {
      fs.writeFileSync(globalMode, JSON.stringify({ mode, upgraded_at: null }, null, 2) + "\n");
    }
  }

  const ledgerFile = opts.global
    ? path.join(targetDir, "ledger.jsonl")
    : path.join(claude0DirPath, "ledger.jsonl");
  if (!fs.existsSync(ledgerFile)) {
    fs.writeFileSync(ledgerFile, "");
    if (repairing) repaired.push(".claude0/ledger.jsonl");
  }

  if (!opts.global) {
    // Configure Claude Code hook (project-level only)
    const claudeDir = path.join(targetDir, ".claude");
    const settingsFile = claudeSettingsPath(targetDir);

    fs.mkdirSync(claudeDir, { recursive: true });

    // Back up settings.json before touching it. Hooks are the user's own
    // configuration; uninstall can only remove claude0's entries, so if we ever
    // damage the rest there must be a copy to go back to.
    if (fs.existsSync(settingsFile)) {
      fs.copyFileSync(settingsFile, path.join(claude0DirPath, "settings.json.backup"));
    }

    // Append rather than spread. `{...settings.hooks, ...HOOK_CONFIG.hooks}`
    // replaces the whole array for an event, so a user's own UserPromptSubmit or
    // PostToolUse hook was silently destroyed by init and could never be
    // restored by uninstall (which filters by command name).
    reconcileHooks(targetDir);

    // .claude0/outputs/ holds the RAW stdout of every compressed Bash command —
    // build logs, env dumps, anything a command printed, including secrets.
    // Without this it is committable by default, which turns a token optimizer
    // into a credential-leak vector. ledger.jsonl is machine-local too.
    const gitignorePath = path.join(targetDir, ".gitignore");
    const needed = [".claude0/outputs/", ".claude0/ledger.jsonl"];
    let gitignore = fs.existsSync(gitignorePath)
      ? fs.readFileSync(gitignorePath, "utf8")
      : "";
    const missing = needed.filter((entry) => !gitignore.split("\n").some((l) => l.trim() === entry));
    if (missing.length > 0) {
      if (gitignore && !gitignore.endsWith("\n")) gitignore += "\n";
      gitignore += `\n# claude0: raw tool output may contain secrets — never commit\n${missing.join("\n")}\n`;
      fs.writeFileSync(gitignorePath, gitignore);
    }

    const guidePath = path.join(targetDir, "CLAUDE0.md");
    if (!fs.existsSync(guidePath)) {
      fs.writeFileSync(guidePath, README);
      if (repairing) repaired.push("CLAUDE0.md");
    }

    if (repairing) {
      const hookResult = detectHookDrift(targetDir);
      if (repaired.length === 0 && hookResult.missing.length === 0) {
        console.log(`Already initialized: ${claude0DirPath} — nothing to repair.`);
      } else {
        console.log(`Repaired existing install at ${claude0DirPath}:`);
        for (const item of repaired) console.log(`  restored  ${item}`);
        if (hookResult.missing.length === 0 && repaired.length > 0) {
          console.log(`  hooks     already registered`);
        }
      }
      console.log(`\nExisting rules, policy, and ledger were left untouched.`);
      return;
    }

    console.log(`claude0 initialized in ${targetDir} (${mode} mode)`);
    console.log(`\nCreated:`);
    if (migratedCount > 0) {
      console.log(`  .claude0/rules/        (${migratedCount} rules migrated from CLAUDE.md)`);
      console.log(`  .claude0/CLAUDE.md.backup  (your original — restored on uninstall)`);
      console.log(`  CLAUDE.md              (stubbed; full rules now load per-prompt)`);
    } else {
      console.log(`  .claude0/rules/        (${Object.keys(SAMPLE_RULES).length} starter rules — no CLAUDE.md found)`);
    }
    console.log(`  .claude0/policy.yaml   (routing policy${mode === "turnkey" ? " — managed" : ""})`);
    console.log(`  .claude0/mode.json     (${mode} mode)`);
    console.log(`  .claude0/ledger.jsonl  (empty log)`);
    console.log(`  .claude/settings.json  (hook configured)`);
    console.log(`  CLAUDE0.md             (usage guide)`);
    if (mode === "turnkey") {
      console.log(`\nNext: Just use Claude Code normally. claude0 works transparently.`);
      console.log(`Run 'claude0 status' to see savings, 'claude0 expert' for advanced features.`);
    } else {
      console.log(`\nExpert mode enabled — full control over routing policy and advanced commands.`);
      console.log(`Run 'claude0 doctor' to check integrations, 'claude0 --help' for all commands.`);
    }
  } else {
    console.log(`Global claude0 initialized in ${targetDir}`);
    console.log(`\nCreated:`);
    console.log(`  ~/.claude0/rules/      (${Object.keys(SAMPLE_RULES).length} sample rules)`);
    console.log(`  ~/.claude0/policy.yaml (routing policy)`);
    console.log(`  ~/.claude0/ledger.jsonl (empty log)`);
    console.log(`\nNote: Global mode creates shared rules/policy but no project hooks.`);
  }
}

function reportCommand(opts: { global?: boolean } = {}) {
  // readLedger takes a REPO root and appends `.claude0/` itself. Passing
  // ~/.claude0 here resolved to ~/.claude0/.claude0/ledger.jsonl — a path
  // `init --global` never writes, so `report --global` always reported an
  // empty ledger. The global install's repo root is $HOME.
  const root = opts.global ? process.env.HOME || "~" : requireClaudeZeroRoot();

  const entries = readLedger(root);
  if (entries.length === 0) {
    console.log("No ledger entries yet.");
    return;
  }

  const report = buildReport(entries);
  const totalSavings =
    report.totalBaselineTokens > 0
      ? ((report.totalBaselineTokens - report.totalTokensIn) /
          report.totalBaselineTokens) *
        100
      : 0;

  console.log(`claude0 Report (${opts.global ? "global" : root})`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Total runs:       ${report.totalRuns}`);
  console.log(
    `Pass rate:        ${report.passCount}/${report.totalRuns} (${((report.passCount / report.totalRuns) * 100).toFixed(1)}%)`
  );
  console.log(`Escalations:      ${report.escalationCount}`);
  console.log(`Stuck:            ${report.stuckCount}`);
  if (report.budgetHalts > 0)
    console.log(`Budget halts:     ${report.budgetHalts}`);
  console.log(`Token savings:    ${totalSavings.toFixed(1)}%  (estimate: cl100k proxy, see note)`);
  console.log(
    `  Baseline:       ${report.totalBaselineTokens.toLocaleString()}`
  );
  console.log(`  Compiled:       ${report.totalTokensIn.toLocaleString()}`);
  console.log(`Tier mix:         ${JSON.stringify(report.tierMix)}`);
  if (Object.keys(report.effortMix).length > 0)
    console.log(`Effort mix:       ${JSON.stringify(report.effortMix)}`);
  console.log(
    `\nNote: token counts use gpt-tokenizer (cl100k), not Claude's tokenizer.\n` +
      `The ratio is a close proxy; absolute counts will differ from Anthropic billing.`
  );

  console.log(`\nSavings by milestone:`);
  for (const [milestone, series] of Object.entries(report.savingsByMilestone)) {
    const avg = series.reduce((a, b) => a + b, 0) / series.length;
    console.log(
      `  ${milestone.padEnd(20)} avg=${(avg * 100).toFixed(1)}% (${series.length} runs)`
    );
    const regressions = detectRegression(series);
    if (regressions.length > 0) {
      console.log(`    ⚠️  Regression at index(es): ${regressions.join(", ")}`);
    }
  }
}

function compileCommand(objective: string, tags: string[]) {
  const root = requireClaudeZeroRoot();

  const fullBundle = fullContextBundle(objective, root);
  const compiledBundle = compile(objective, tags, tags, root);

  const baselineTokens = tokenCount(fullBundle);
  const compiledTokens = tokenCount(compiledBundle);
  const savings = ((baselineTokens - compiledTokens) / baselineTokens) * 100;

  console.log(`Objective: ${objective}`);
  console.log(`Tags: [${tags.join(", ")}]`);
  console.log(`\nBaseline tokens:  ${baselineTokens}`);
  console.log(`Compiled tokens:  ${compiledTokens}`);
  console.log(`Savings:          ${savings.toFixed(1)}%  (estimate: cl100k proxy)`);
  console.log(`\nRules included:   ${compiledBundle.rules_included.join(", ")}`);
  console.log(`Rules excluded:   ${compiledBundle.rules_excluded.join(", ")}`);
}

function uninstallCommand(opts: { global?: boolean; force?: boolean } = {}) {
  const targetDir = opts.global
    ? path.join(process.env.HOME || "~", ".claude0")
    : process.cwd();

  const claude0DirPath = opts.global ? targetDir : claude0Dir(targetDir);

  if (!fs.existsSync(claude0DirPath)) {
    console.error(`claude0 not initialized in ${targetDir}`);
    process.exit(1);
  }

  // Warn if ledger has data
  if (!opts.global) {
    const ledgerFile = path.join(claude0DirPath, "ledger.jsonl");
    if (fs.existsSync(ledgerFile)) {
      const lines = fs.readFileSync(ledgerFile, "utf8").split("\n").filter((l) => l.trim());
      if (lines.length > 0 && !opts.force) {
        console.error(`Warning: Ledger has ${lines.length} entries. Data will be lost.`);
        console.error(`Use --force to proceed with uninstall.`);
        process.exit(1);
      }
    }
  }

  // Restore the user's CLAUDE.md from the migration backup BEFORE we delete
  // .claude0/ (which holds the backup). Reversibility is the whole point of the
  // backup — uninstall must undo the stubbing init did.
  let restoredClaudeMd = false;
  let reconstituted = false;
  let orphanedPath = "";
  if (!opts.global) {
    const backup = claudeMdBackupPath(targetDir);
    const claudeMdPath = path.join(targetDir, "CLAUDE.md");
    const current = fs.existsSync(claudeMdPath) ? fs.readFileSync(claudeMdPath, "utf8") : "";
    // "Untouched since init" means the file is still claude0's stub. Anything
    // else is the user's own writing and must not be silently overwritten.
    const isStub = current.trim() === CLAUDE_MD_STUB.trim();

    if (fs.existsSync(backup)) {
      if (current && !isStub) {
        // The user edited CLAUDE.md after init. Restoring the backup would
        // silently discard that work, so keep it beside the restored file.
        orphanedPath = path.join(targetDir, "CLAUDE.md.claude0-orphaned");
        fs.writeFileSync(orphanedPath, current);
      }
      fs.writeFileSync(claudeMdPath, fs.readFileSync(backup));
      restoredClaudeMd = true;
    } else if (isStub || !current) {
      // No backup, and CLAUDE.md is only claude0's stub: every rule the user
      // owns lives in .claude0/rules/, which the rmSync below is about to
      // delete. Rebuild a CLAUDE.md from them rather than destroying the lot.
      const rules = rulesDir(targetDir);
      const files = fs.existsSync(rules)
        ? fs.readdirSync(rules).filter((f) => f.endsWith(".md")).sort()
        : [];
      if (files.length > 0) {
        const body = files
          .map((f) => fs.readFileSync(path.join(rules, f), "utf8").trim())
          .join("\n\n");
        fs.writeFileSync(
          claudeMdPath,
          `# Project Rules\n\n` +
            `<!-- Reconstituted by 'claude0 uninstall' from .claude0/rules/.\n` +
            `     The original CLAUDE.md backup was missing, so these rules were\n` +
            `     merged back rather than deleted. Frontmatter tags are retained. -->\n\n` +
            `${body}\n`
        );
        reconstituted = true;
      }
    }
  }

  // Remove .claude0/
  fs.rmSync(claude0DirPath, { recursive: true, force: true });
  console.log(`Removed: ${claude0DirPath}`);
  if (restoredClaudeMd) console.log(`Restored: CLAUDE.md (from backup)`);
  if (orphanedPath) {
    console.log(`Kept:     ${path.basename(orphanedPath)} (your post-init edits — not discarded)`);
  }
  if (reconstituted) {
    console.log(`Rebuilt:  CLAUDE.md from .claude0/rules/ (no backup existed — rules were not lost)`);
  }

  if (!opts.global) {
    // Remove hook from .claude/settings.json
    const settingsFile = claudeSettingsPath(targetDir);
    if (fs.existsSync(settingsFile)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
        // Strip only claude0's own command entries, preserving user-added hooks.
        // Covers both hooks claude0 registers (intercept + compress-output).
        const ourCommands = [HOOK_COMMAND, POST_TOOL_COMMAND];
        let changed = false;
        for (const event of [HOOK_EVENT, POST_TOOL_EVENT]) {
          const entries = settings.hooks?.[event];
          if (!Array.isArray(entries)) continue;
          const cleaned = entries
            .map((group: any) => ({
              ...group,
              hooks: (group.hooks ?? []).filter(
                (h: any) => !ourCommands.includes(h?.command)
              ),
            }))
            .filter((group: any) => (group.hooks ?? []).length > 0);
          if (cleaned.length > 0) {
            settings.hooks[event] = cleaned;
          } else {
            delete settings.hooks[event];
          }
          changed = true;
        }
        if (changed) {
          if (settings.hooks && Object.keys(settings.hooks).length === 0) {
            delete settings.hooks;
          }
          fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
          console.log(`Removed hook from: ${settingsFile}`);
        }
      } catch {
        console.warn(`Could not update ${settingsFile} (malformed JSON)`);
      }
    }

    // Remove the generated usage guide. ZIPLINE_README.md is the pre-rename
    // name — still cleaned up so upgrading installs do not leave it behind.
    for (const stale of ["ZIPLINE_README.md"]) {
      const p = path.join(targetDir, stale);
      if (fs.existsSync(p)) fs.rmSync(p, { force: true });
    }
    const readmePath = path.join(targetDir, "CLAUDE0.md");
    if (fs.existsSync(readmePath)) {
      fs.unlinkSync(readmePath);
      console.log(`Removed: ${readmePath}`);
    }
  }

  console.log(`\nclaude0 uninstalled from ${opts.global ? "global" : targetDir}`);
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    // No piped input (e.g. run manually in a TTY): don't hang waiting on stdin.
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function interceptCommand() {
  // interceptFromStdin owns its own process.exit for expected failures, but
  // main() is synchronous — its try/catch has already returned by the time this
  // promise settles, so an unexpected rejection would become an unhandled
  // rejection: stack trace on stderr, exit 1, inside the user's prompt path.
  // This catch is what actually makes the hook fail OPEN.
  interceptFromStdin(readStdin).catch(() => process.exit(0));
}

function statusCommand() {
  const root = requireClaudeZeroRoot();
  const entries = readLedger(root);

  if (entries.length === 0) {
    console.log("No activity yet. Use Claude Code normally — claude0 will start logging.");
    return;
  }

  const report = buildReport(entries);
  const totalSavings =
    report.totalBaselineTokens > 0
      ? ((report.totalBaselineTokens - report.totalTokensIn) /
          report.totalBaselineTokens) *
        100
      : 0;
  const passRate = ((report.passCount / report.totalRuns) * 100).toFixed(1);

  console.log("claude0 Status");
  console.log("─".repeat(33));
  console.log(`✓ Saving ${totalSavings.toFixed(1)}% on average`);
  console.log(`✓ ${report.totalRuns} runs, ${passRate}% success rate`);

  const topTier = Object.entries(report.tierMix).sort((a, b) => b[1] - a[1])[0];
  if (topTier) {
    const others = Object.keys(report.tierMix).filter(t => t !== topTier[0]).join("/") || "none";
    console.log(`✓ Using mostly ${topTier[0]}${others !== "none" ? `, rarely ${others}` : ""}`);
  }

  console.log("");
  console.log("Everything working well.");

  const mode = readMode(root).mode;
  if (mode === "turnkey") {
    console.log("Run 'claude0 expert' for advanced controls.");
  } else {
    console.log("Run 'claude0 report' for detailed metrics.");
  }
}

function expertCommand() {
  const root = requireClaudeZeroRoot();
  const current = readMode(root);

  if (current.mode === "expert") {
    console.log("Already in expert mode.");
    return;
  }

  upgradeToExpert(root);

  // Rewrite policy.yaml header
  const policyFile = policyPath(root);
  if (fs.existsSync(policyFile)) {
    const currentPolicy = fs.readFileSync(policyFile, "utf8");
    const lines = currentPolicy.split("\n");

    // Strip old header, add expert header
    const contentStart = lines.findIndex(l => l.match(/^[a-z]/));
    const content = lines.slice(contentStart).join("\n");
    fs.writeFileSync(policyFile, EXPERT_POLICY.split("\n").slice(0, 7).join("\n") + "\n" + content);
  }

  console.log("✓ Upgraded to expert mode");
  console.log("");
  console.log("Changes:");
  console.log("  • policy.yaml unlocked for manual editing");
  console.log("  • All advanced commands now available");
  console.log("  • Full control over routing and tuning");
  console.log("");
  console.log("Next steps:");
  console.log("  claude0 doctor     — Check integrations");
  console.log("  claude0 report     — Detailed metrics");
  console.log("  claude0 --help     — See all commands");
}

function turnkeyCommand() {
  const root = requireClaudeZeroRoot();
  const current = readMode(root);

  if (current.mode === "turnkey") {
    console.log("Already in turnkey mode.");
    return;
  }

  downgradeToTurnkey(root);

  // Rewrite policy.yaml header
  const policyFile = policyPath(root);
  if (fs.existsSync(policyFile)) {
    const currentPolicy = fs.readFileSync(policyFile, "utf8");
    const lines = currentPolicy.split("\n");

    // Strip old header, add turnkey header
    const contentStart = lines.findIndex(l => l.match(/^[a-z]/));
    const content = lines.slice(contentStart).join("\n");
    fs.writeFileSync(policyFile, TURNKEY_POLICY.split("\n").slice(0, 3).join("\n") + "\n\n" + content);
  }

  console.log("✓ Downgraded to turnkey mode");
  console.log("");
  console.log("Changes:");
  console.log("  • policy.yaml locked (managed by claude0)");
  console.log("  • Advanced commands hidden from help");
  console.log("  • Simplified command interface");
  console.log("");
  console.log("Run 'claude0 status' to check how it's working.");
}

/**
 * Reconciles an existing install with the current version's hook config.
 *
 * Upgrading the npm package swaps the binary but cannot touch .claude/settings.json,
 * and `init` refuses to run on an existing .claude0/. Without this, a hook added
 * in a later release (compress-output was) never reaches anyone who installed
 * earlier. Deliberately narrow: hooks only — rules, policy, ledger, and the
 * CLAUDE.md backup are left exactly as they are.
 */
function upgradeCommand() {
  const root = requireClaudeZeroRoot();
  const stamped = readInstallVersion(root);
  const from = stamped?.version ?? "pre-1.1 (unstamped)";

  const result = reconcileHooks(root);
  if (result.unreadable) {
    console.error(`Error: ${claudeSettingsPath(root)} is not valid JSON.`);
    console.error("Fix or remove it, then run 'claude0 upgrade' again.");
    process.exit(1);
  }

  // State migrations run before the stamp is rewritten, so a crash mid-chain
  // leaves the old version recorded and the next run retries.
  const migrations = pendingMigrations(root);
  for (const m of migrations) {
    try {
      m.run(root);
      console.log(`✓ Migrated: ${m.describe}`);
    } catch (err) {
      console.error(`Error during migration "${m.describe}": ${err}`);
      console.error("Install left at the previous version; rerun 'claude0 upgrade' after fixing.");
      process.exit(1);
    }
  }

  stampUpgrade(root);

  if (result.added.length === 0 && migrations.length === 0) {
    console.log(`✓ Already up to date (v${packageVersion()}) — all hooks registered.`);
    return;
  }

  if (result.added.length > 0) {
    console.log(`✓ Registered ${result.added.length} missing hook${result.added.length === 1 ? "" : "s"}:`);
    for (const hook of result.added) {
      console.log(`  • ${hook.event} — ${hook.label} (${hook.command})`);
    }
  }
  console.log("");
  console.log(`Upgraded ${from} → v${packageVersion()}. Takes effect on your next Claude Code prompt.`);
}

function doctorCommand() {
  const root = requireClaudeZeroRoot();
  const env = detectRepoEnv(root);

  console.log("claude0 Integrations");
  console.log("─".repeat(52));
  for (const cap of CAPABILITIES) {
    const a = resolveAvailability(cap, root, env);
    const mark =
      a.status === "accelerated" ? "✓" : a.status === "native" ? "✓" : a.status === "inactive" ? "○" : "✗";
    let line = `${mark} ${cap.name.padEnd(16)} ${a.detail}`;
    if (a.advisory) line += `  · ${a.advisory}`;
    console.log(line);
  }

  // Capability net-delta over recent ledger entries. This is the CAPABILITY
  // delta only (input tokens before vs after each capability transform) — it is
  // NOT the M1 compiler savings (baseline_tokens vs tokens_in), which `claude0
  // report` shows. Kept separate so the two are never double-counted.
  const caps = readLedger(root)
    .flatMap((e) => e.capabilities ?? [])
    .filter((c) => !c.net_delta_exempt && c.tokens_before > 0);
  const recent = caps.slice(-20);
  if (recent.length > 0) {
    const before = recent.reduce((s, c) => s + c.tokens_before, 0);
    const after = recent.reduce((s, c) => s + c.tokens_after, 0);
    const pct = before > 0 ? (((before - after) / before) * 100).toFixed(1) : "0";
    console.log("");
    console.log(
      `Capability net delta (last ${recent.length} runs): ${pct}%  [capability transforms only; separate from compiler savings in 'claude0 report']`
    );
  } else {
    console.log("");
    console.log("Capability net delta: no capability runs logged yet.");
  }

  // Hook drift. `init` exits early on an existing .claude0/, so an install made
  // before a hook was added never receives it — the feature is silently absent
  // rather than broken. Surfacing it here is the only way a user finds out.
  const drift = detectHookDrift(root);
  const installed = readInstallVersion(root);
  console.log("");
  console.log("Install");
  console.log("─".repeat(52));
  if (!installed) {
    console.log(`○ version          unstamped (created before version tracking)`);
    console.log(`                   run 'claude0 upgrade' to stamp it`);
  } else if (installed.version !== packageVersion()) {
    console.log(`✗ version          state v${installed.version}, binary v${packageVersion()}`);
    console.log(`                   run 'claude0 upgrade' to migrate`);
  } else {
    console.log(`✓ version          v${installed.version}`);
  }

  console.log("");
  console.log("Hooks");
  console.log("─".repeat(52));
  if (drift.unreadable) {
    console.log("✗ .claude/settings.json is not valid JSON — cannot verify hooks");
  } else {
    for (const hook of drift.present) {
      console.log(`✓ ${hook.event.padEnd(16)} ${hook.label} active`);
    }
    for (const hook of drift.missing) {
      console.log(`✗ ${hook.event.padEnd(16)} ${hook.label} NOT registered`);
    }
    if (drift.missing.length > 0) {
      console.log("");
      console.log(`Run 'claude0 upgrade' to register ${drift.missing.length === 1 ? "it" : "them"}.`);
    }
  }

  // Optional orchestration layer (gstack). Detected, never invoked — claude0's
  // job is token accounting; gstack owns multi-agent orchestration leaves.
  // Honest degradation: if it isn't installed, we say so and nothing breaks.
  console.log("");
  console.log("Orchestration (optional)");
  console.log("─".repeat(52));
  if (env.gstackInstalled) {
    console.log("✓ gstack           installed — orchestration leaves available");
  } else {
    console.log(
      "○ gstack           not installed — orchestration leaves unavailable (optional)"
    );
  }
}

function main() {
  const [, , command, ...args] = process.argv;

  // --global was accepted silently by every command but implemented by only
  // three. The rest called requireClaudeZeroRoot(), which walks upward — so from
  // any directory under $HOME they resolved the GLOBAL install as if it were a
  // project, operating on shared state with no indication. Reject explicitly.
  const GLOBAL_AWARE = ["init", "report", "uninstall"];
  if (args.includes("--global") && command && !GLOBAL_AWARE.includes(command)) {
    console.error(`'claude0 ${command}' does not support --global.`);
    console.error(`Global-aware commands: ${GLOBAL_AWARE.join(", ")}.`);
    process.exit(1);
  }

  try {
    switch (command) {
      case "init":
        initCommand({
          global: args.includes("--global"),
          expert: args.includes("--expert"),
        });
        break;

      case "status":
        statusCommand();
        break;

      case "expert":
        expertCommand();
        break;

      case "turnkey":
        turnkeyCommand();
        break;

      case "report":
        reportCommand({ global: args.includes("--global") });
        break;

      case "compile": {
        if (args.length < 2) {
          console.error('Usage: claude0 compile "objective" tag1,tag2,tag3');
          process.exit(1);
        }
        const objective = args[0];
        const tags = args[1].split(",").map((t) => t.trim());
        compileCommand(objective, tags);
        break;
      }

      case "uninstall":
        uninstallCommand({
          global: args.includes("--global"),
          force: args.includes("--force"),
        });
        break;

      case "doctor":
        doctorCommand();
        break;

      case "upgrade":
        upgradeCommand();
        break;

      case "policy": {
        const root = requireClaudeZeroRoot();
        const sub = args[0];
        if (sub === "push") {
          const r = pushPolicy(root);
          console.log(`Pushed policy → ${r.central}`);
          console.log(`Changed ${r.changed.length} step(s): ${r.changed.join(", ") || "none"}`);
        } else if (sub === "pull") {
          const r = pullPolicy(root);
          console.log(`Pulled policy ← ${r.central}`);
          console.log(`Updated ${r.changed.length} step(s): ${r.changed.join(", ") || "none"}`);
          console.log(`Per-repo overrides preserved.`);
        } else {
          console.error("Usage: claude0 policy <pull|push>");
          console.error(`Central store: ${centralPolicyPath()}`);
          process.exit(1);
        }
        break;
      }

      case "learn": {
        const root = requireClaudeZeroRoot();
        const proposals = proposeChanges(readLedger(root));
        console.log(renderProposals(proposals));
        if (args.includes("--apply")) {
          // Applying is a one-way change to rules; gate behind explicit approval.
          // (Write path intentionally minimal in this milestone — proposals are
          // the reviewable artifact; auto-writing rules is deferred.)
          console.log(
            `\n--apply given: ${proposals.length} change(s) staged for approval. ` +
              `Review above, then edit .claude0/rules/ accordingly. ` +
              `(Automatic rule rewriting is deferred; proposals stay human-approved.)`
          );
        }
        break;
      }

      case "intercept":
        interceptCommand();
        break;

      case "compress-output":
        // Same fail-open contract as intercept above: never let a rejection
        // reach the tool pipeline as an unhandled error.
        compressOutputFromStdin(readStdin).catch(() => process.exit(0));
        break;

      case "recall": {
        const root = requireClaudeZeroRoot();
        const id = args[0];
        if (!id) {
          console.error("Usage: claude0 recall <id>");
          process.exit(1);
        }
        const original = recallOutput(id, root);
        if (original === null) {
          console.error(`No stashed output for id "${id}" (it may have been pruned).`);
          process.exit(1);
        }
        process.stdout.write(original);
        break;
      }

      case "bloat": {
        const root = requireClaudeZeroRoot();
        if (args.includes("--fix")) {
          const dryRun = args.includes("--dry-run");
          console.log(dryRun ? "DRY RUN — no files will be modified\n" : "");
          const fixes = autoFixBloat(root, dryRun);
          if (fixes.length === 0) {
            console.log("No auto-fixable bloat detected.");
          } else {
            console.log(`Applied ${fixes.length} fix(es):`);
            fixes.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
          }
        } else {
          printBloatReport(root);
        }
        break;
      }

      default: {
        // Detect mode for help text (if in a claude0 repo)
        const root = findClaudeZeroRoot();
        const mode = root ? readMode(root).mode : "turnkey";
        const isExpert = mode === "expert";

        if (isExpert) {
          // Expert mode: show all commands
          console.log(`claude0 — deterministic orchestration spine for Claude Code

Usage:
  claude0 init [--expert] [--global]     Initialize .claude0/ in current dir (or ~/.claude0/)
  claude0 status                         Simple savings summary
  claude0 report [--global]              Detailed token savings and system metrics
  claude0 compile "goal" tags            Compile context bundle for a step
  claude0 doctor                         Show integrations stack + per-repo availability
  claude0 upgrade                        Register hooks added since this project was initialized
  claude0 policy <pull|push>             Sync routing policy with the central store (repo overrides win)
  claude0 learn [--apply]                Propose rule changes from ledger evidence
  claude0 bloat [--fix] [--dry-run]      Detect context bloat and optionally auto-fix
  claude0 recall <id>                    Print the full original of a compressed tool output
  claude0 turnkey                        Switch to turnkey mode (managed policy)
  claude0 uninstall [--global] [--force] Remove .claude0/ and hooks (restores CLAUDE.md)
  claude0 intercept                      (Internal: called by Claude Code hook)

Examples:
  claude0 report                         # Detailed metrics
  claude0 compile "fix auth bug" typescript,security,testing
  claude0 doctor                         # Check integrations
  claude0 learn --apply                  # Apply rule improvements

After init, claude0 runs transparently — just use Claude Code normally.
`);
        } else {
          // Turnkey mode: show only essential commands
          console.log(`claude0 — cut Claude Code token usage, automatically

Usage:
  claude0 init [--expert]         Set up claude0 in your project
  claude0 status                  Check how much you're saving
  claude0 expert                  Unlock advanced features
  claude0 upgrade                 Sync hooks after updating the claude0 package
  claude0 uninstall [--force]     Remove claude0 (restores your CLAUDE.md)

Examples:
  claude0 init                    # One command, fully set up
  claude0 status                  # See your savings

After init, just use Claude Code normally. claude0 works in the background.

Want more control? Run 'claude0 expert' for advanced commands.
`);
        }
        process.exit(command ? 1 : 0);
      }
    }
  } catch (err) {
    if (err instanceof Error) {
      console.error(`Error: ${err.message}`);
    } else {
      console.error(`Unknown error: ${err}`);
    }
    process.exit(1);
  }
}

main();
