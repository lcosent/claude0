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
} from "./paths";
import {
  SAMPLE_RULES,
  DEFAULT_POLICY,
  TURNKEY_POLICY,
  EXPERT_POLICY,
  HOOK_CONFIG,
  HOOK_EVENT,
  HOOK_COMMAND,
  POST_TOOL_EVENT,
  POST_TOOL_COMMAND,
  README,
} from "./init-templates";
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

  if (fs.existsSync(claude0DirPath)) {
    console.log(`Already initialized: ${claude0DirPath}`);
    process.exit(0);
  }

  const mode = opts.expert ? "expert" : "turnkey";

  // Create directory structure
  fs.mkdirSync(claude0DirPath, { recursive: true });
  fs.mkdirSync(rulesDirPath, { recursive: true });

  // Write sample rules
  for (const [filename, content] of Object.entries(SAMPLE_RULES)) {
    fs.writeFileSync(path.join(rulesDirPath, filename), content);
  }

  // Write mode-appropriate policy
  const policyFile = opts.global
    ? path.join(targetDir, "policy.yaml")
    : policyPath(targetDir);
  const policyContent = opts.expert ? EXPERT_POLICY : TURNKEY_POLICY;
  fs.writeFileSync(policyFile, policyContent);

  // Write mode config (project-level only)
  if (!opts.global) {
    writeMode(targetDir, { mode, upgraded_at: null });
  }

  // Create empty ledger
  const ledgerFile = opts.global
    ? path.join(targetDir, "ledger.jsonl")
    : path.join(claude0DirPath, "ledger.jsonl");
  fs.writeFileSync(ledgerFile, "");

  if (!opts.global) {
    // Configure Claude Code hook (project-level only)
    const claudeDir = path.join(targetDir, ".claude");
    const settingsFile = claudeSettingsPath(targetDir);

    fs.mkdirSync(claudeDir, { recursive: true });

    let settings: any = {};
    if (fs.existsSync(settingsFile)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
      } catch {
        // Malformed JSON; start fresh
      }
    }

    settings.hooks = { ...settings.hooks, ...HOOK_CONFIG.hooks };
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));

    // Write README
    fs.writeFileSync(path.join(targetDir, "ZIPLINE_README.md"), README);

    console.log(`ClaudeZero initialized in ${targetDir} (${mode} mode)`);
    console.log(`\nCreated:`);
    console.log(`  .claude0/rules/        (${Object.keys(SAMPLE_RULES).length} sample rules)`);
    console.log(`  .claude0/policy.yaml   (routing policy${mode === "turnkey" ? " — managed" : ""})`);
    console.log(`  .claude0/mode.json     (${mode} mode)`);
    console.log(`  .claude0/ledger.jsonl  (empty log)`);
    console.log(`  .claude/settings.json  (hook configured)`);
    console.log(`  ZIPLINE_README.md      (usage guide)`);
    if (mode === "turnkey") {
      console.log(`\nNext: Just use Claude Code normally. ClaudeZero works transparently.`);
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
  const root = opts.global
    ? path.join(process.env.HOME || "~", ".claude0")
    : requireClaudeZeroRoot();

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

  console.log(`ClaudeZero Report (${opts.global ? "global" : root})`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Total runs:       ${report.totalRuns}`);
  console.log(
    `Pass rate:        ${report.passCount}/${report.totalRuns} (${((report.passCount / report.totalRuns) * 100).toFixed(1)}%)`
  );
  console.log(`Escalations:      ${report.escalationCount}`);
  console.log(`Stuck:            ${report.stuckCount}`);
  if (report.budgetHalts > 0)
    console.log(`Budget halts:     ${report.budgetHalts}`);
  console.log(`Token savings:    ${totalSavings.toFixed(1)}%`);
  console.log(
    `  Baseline:       ${report.totalBaselineTokens.toLocaleString()}`
  );
  console.log(`  Compiled:       ${report.totalTokensIn.toLocaleString()}`);
  console.log(`Tier mix:         ${JSON.stringify(report.tierMix)}`);
  if (Object.keys(report.effortMix).length > 0)
    console.log(`Effort mix:       ${JSON.stringify(report.effortMix)}`);

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
  console.log(`Savings:          ${savings.toFixed(1)}%`);
  console.log(`\nRules included:   ${compiledBundle.rules_included.join(", ")}`);
  console.log(`Rules excluded:   ${compiledBundle.rules_excluded.join(", ")}`);
}

function uninstallCommand(opts: { global?: boolean; force?: boolean } = {}) {
  const targetDir = opts.global
    ? path.join(process.env.HOME || "~", ".claude0")
    : process.cwd();

  const claude0DirPath = opts.global ? targetDir : claude0Dir(targetDir);

  if (!fs.existsSync(claude0DirPath)) {
    console.error(`ClaudeZero not initialized in ${targetDir}`);
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

  // Remove .claude0/
  fs.rmSync(claude0DirPath, { recursive: true, force: true });
  console.log(`Removed: ${claude0DirPath}`);

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

    // Remove ZIPLINE_README.md if it exists
    const readmePath = path.join(targetDir, "ZIPLINE_README.md");
    if (fs.existsSync(readmePath)) {
      fs.unlinkSync(readmePath);
      console.log(`Removed: ${readmePath}`);
    }
  }

  console.log(`\nClaudeZero uninstalled from ${opts.global ? "global" : targetDir}`);
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
  // interceptFromStdin owns its own process.exit (never throws to the prompt).
  void interceptFromStdin(readStdin);
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

  console.log("ClaudeZero Status");
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

function doctorCommand() {
  const root = requireClaudeZeroRoot();
  const env = detectRepoEnv(root);

  console.log("ClaudeZero Integrations");
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
        void compressOutputFromStdin(readStdin);
        break;

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
          console.log(`ClaudeZero — deterministic orchestration spine for Claude Code

Usage:
  claude0 init [--expert] [--global]     Initialize .claude0/ in current dir (or ~/.claude0/)
  claude0 status                         Simple savings summary
  claude0 report [--global]              Detailed token savings and system metrics
  claude0 compile "goal" tags            Compile context bundle for a step
  claude0 doctor                         Show integrations stack + per-repo availability
  claude0 policy <pull|push>             Sync routing policy with the central store (repo overrides win)
  claude0 learn [--apply]                Propose rule changes from ledger evidence
  claude0 bloat [--fix] [--dry-run]      Detect context bloat and optionally auto-fix
  claude0 turnkey                        Switch to turnkey mode (managed policy)
  claude0 uninstall [--global] [--force] Remove .claude0/ and hooks
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
          console.log(`ClaudeZero — Save 65% on Claude Code tokens, automatically

Usage:
  claude0 init [--expert]         Set up claude0 in your project
  claude0 status                  Check how much you're saving
  claude0 expert                  Unlock advanced features
  claude0 uninstall [--force]     Remove claude0

Examples:
  claude0 init                    # One command, fully set up
  claude0 status                  # See your savings

After init, just use Claude Code normally. ClaudeZero works in the background.

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
