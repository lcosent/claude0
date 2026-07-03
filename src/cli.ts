#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import {
  findHarnessRoot,
  requireHarnessRoot,
  harnessDir,
  rulesDir,
  policyPath,
  claudeSettingsPath,
} from "./paths";
import {
  SAMPLE_RULES,
  DEFAULT_POLICY,
  HOOK_CONFIG,
  HOOK_EVENT,
  HOOK_COMMAND,
  POST_TOOL_EVENT,
  POST_TOOL_COMMAND,
  README,
} from "./init-templates";
import { interceptFromStdin } from "./intercept";
import { compressOutputFromStdin } from "./compress-output";
import { CAPABILITIES, detectRepoEnv, resolveAvailability } from "./integrations";
import { readLedger } from "./ledger";
import { buildReport, detectRegression } from "./report";
import { compile, fullContextBundle, tokenCount } from "./compiler";

function initCommand(opts: { global?: boolean } = {}) {
  const targetDir = opts.global
    ? path.join(process.env.HOME || "~", ".harness")
    : process.cwd();

  const harnessDirPath = opts.global ? targetDir : harnessDir(targetDir);
  const rulesDirPath = opts.global
    ? path.join(targetDir, "rules")
    : rulesDir(targetDir);

  if (fs.existsSync(harnessDirPath)) {
    console.error(`Already initialized: ${harnessDirPath}`);
    process.exit(1);
  }

  // Create directory structure
  fs.mkdirSync(harnessDirPath, { recursive: true });
  fs.mkdirSync(rulesDirPath, { recursive: true });

  // Write sample rules
  for (const [filename, content] of Object.entries(SAMPLE_RULES)) {
    fs.writeFileSync(path.join(rulesDirPath, filename), content);
  }

  // Write default policy
  const policyFile = opts.global
    ? path.join(targetDir, "policy.yaml")
    : policyPath(targetDir);
  fs.writeFileSync(policyFile, DEFAULT_POLICY);

  // Create empty ledger
  const ledgerFile = opts.global
    ? path.join(targetDir, "ledger.jsonl")
    : path.join(harnessDirPath, "ledger.jsonl");
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
    fs.writeFileSync(path.join(targetDir, "HARNESS_README.md"), README);

    console.log(`Harness initialized in ${targetDir}`);
    console.log(`\nCreated:`);
    console.log(`  .harness/rules/        (${Object.keys(SAMPLE_RULES).length} sample rules)`);
    console.log(`  .harness/policy.yaml   (routing policy)`);
    console.log(`  .harness/ledger.jsonl  (empty log)`);
    console.log(`  .claude/settings.json  (hook configured)`);
    console.log(`  HARNESS_README.md      (usage guide)`);
    console.log(`\nNext: Just use Claude Code normally. Harness will compile context transparently.`);
  } else {
    console.log(`Global harness initialized in ${targetDir}`);
    console.log(`\nCreated:`);
    console.log(`  ~/.harness/rules/      (${Object.keys(SAMPLE_RULES).length} sample rules)`);
    console.log(`  ~/.harness/policy.yaml (routing policy)`);
    console.log(`  ~/.harness/ledger.jsonl (empty log)`);
    console.log(`\nNote: Global mode creates shared rules/policy but no project hooks.`);
  }
}

function reportCommand(opts: { global?: boolean } = {}) {
  const root = opts.global
    ? path.join(process.env.HOME || "~", ".harness")
    : requireHarnessRoot();

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

  console.log(`Harness Report (${opts.global ? "global" : root})`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Total runs:       ${report.totalRuns}`);
  console.log(
    `Pass rate:        ${report.passCount}/${report.totalRuns} (${((report.passCount / report.totalRuns) * 100).toFixed(1)}%)`
  );
  console.log(`Escalations:      ${report.escalationCount}`);
  console.log(`Stuck:            ${report.stuckCount}`);
  console.log(`Token savings:    ${totalSavings.toFixed(1)}%`);
  console.log(
    `  Baseline:       ${report.totalBaselineTokens.toLocaleString()}`
  );
  console.log(`  Compiled:       ${report.totalTokensIn.toLocaleString()}`);
  console.log(`Tier mix:         ${JSON.stringify(report.tierMix)}`);

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
  const root = requireHarnessRoot();

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
    ? path.join(process.env.HOME || "~", ".harness")
    : process.cwd();

  const harnessDirPath = opts.global ? targetDir : harnessDir(targetDir);

  if (!fs.existsSync(harnessDirPath)) {
    console.error(`Harness not initialized in ${targetDir}`);
    process.exit(1);
  }

  // Warn if ledger has data
  if (!opts.global) {
    const ledgerFile = path.join(harnessDirPath, "ledger.jsonl");
    if (fs.existsSync(ledgerFile)) {
      const lines = fs.readFileSync(ledgerFile, "utf8").split("\n").filter((l) => l.trim());
      if (lines.length > 0 && !opts.force) {
        console.error(`Warning: Ledger has ${lines.length} entries. Data will be lost.`);
        console.error(`Use --force to proceed with uninstall.`);
        process.exit(1);
      }
    }
  }

  // Remove .harness/
  fs.rmSync(harnessDirPath, { recursive: true, force: true });
  console.log(`Removed: ${harnessDirPath}`);

  if (!opts.global) {
    // Remove hook from .claude/settings.json
    const settingsFile = claudeSettingsPath(targetDir);
    if (fs.existsSync(settingsFile)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
        // Strip only harness's own command entries, preserving user-added hooks.
        // Covers both hooks harness registers (intercept + compress-output).
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

    // Remove HARNESS_README.md if it exists
    const readmePath = path.join(targetDir, "HARNESS_README.md");
    if (fs.existsSync(readmePath)) {
      fs.unlinkSync(readmePath);
      console.log(`Removed: ${readmePath}`);
    }
  }

  console.log(`\nHarness uninstalled from ${opts.global ? "global" : targetDir}`);
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

function doctorCommand() {
  const root = requireHarnessRoot();
  const env = detectRepoEnv(root);

  console.log("Harness Integrations");
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
  // NOT the M1 compiler savings (baseline_tokens vs tokens_in), which `harness
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
      `Capability net delta (last ${recent.length} runs): ${pct}%  [capability transforms only; separate from compiler savings in 'harness report']`
    );
  } else {
    console.log("");
    console.log("Capability net delta: no capability runs logged yet.");
  }
}

function main() {
  const [, , command, ...args] = process.argv;

  try {
    switch (command) {
      case "init":
        initCommand({ global: args.includes("--global") });
        break;

      case "report":
        reportCommand({ global: args.includes("--global") });
        break;

      case "compile": {
        if (args.length < 2) {
          console.error('Usage: harness compile "objective" tag1,tag2,tag3');
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

      case "intercept":
        interceptCommand();
        break;

      case "compress-output":
        void compressOutputFromStdin(readStdin);
        break;

      default:
        console.log(`Harness — deterministic orchestration spine for Claude Code

Usage:
  harness init [--global]         Initialize .harness/ in current dir (or ~/.harness/)
  harness report [--global]       Show token savings and system metrics
  harness compile "goal" tags     Compile context bundle for a step
  harness doctor                  Show integrations stack + per-repo availability
  harness uninstall [--global] [--force]  Remove .harness/ and hooks
  harness intercept               (Internal: called by Claude Code hook)

Examples:
  harness init                    # Set up harness in current project
  harness report                  # View stats for current project
  harness compile "fix auth bug" typescript,security,testing
  harness uninstall               # Remove harness from current project
  harness uninstall --force       # Remove even if ledger has data

After init, harness runs transparently — just use Claude Code normally.
`);
        process.exit(command ? 1 : 0);
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
