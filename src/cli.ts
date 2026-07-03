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
import { SAMPLE_RULES, DEFAULT_POLICY, HOOK_CONFIG, README } from "./init-templates";
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

function interceptCommand() {
  console.log("Harness intercept hook (not yet implemented)");
  console.log("This will be called by Claude Code on user-prompt-submit");
  process.exit(0);
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

      case "intercept":
        interceptCommand();
        break;

      default:
        console.log(`Harness — deterministic orchestration spine for Claude Code

Usage:
  harness init [--global]         Initialize .harness/ in current dir (or ~/.harness/)
  harness report [--global]       Show token savings and system metrics
  harness compile "goal" tags     Compile context bundle for a step
  harness intercept               (Internal: called by Claude Code hook)

Examples:
  harness init                    # Set up harness in current project
  harness report                  # View stats for current project
  harness compile "fix auth bug" typescript,security,testing

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
