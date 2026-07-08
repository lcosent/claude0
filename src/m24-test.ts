// M24: Context Bloat Detection & Prevention
//
// GATE: zipline bloat command exists, detects all four bloat vectors (structural,
// cache, compression, escalation), and produces actionable recommendations. Auto-
// fix applies safe transformations (split overweight rules, merge redundant pairs)
// without breaking the ledger or compiler.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { detectBloat, autoFixBloat, printBloatReport } from "./bloat-detector";
import { appendLedger, readLedger } from "./ledger";
import { loadRules } from "./compiler";
import { encode } from "gpt-tokenizer";

function makeTempRepo(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zipline-m24-"));
  const ziplineDir = path.join(tmp, ".zipline");
  const rulesDir = path.join(ziplineDir, "rules");
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(path.join(ziplineDir, "ledger.jsonl"), "");
  return tmp;
}

function writeRule(repoRoot: string, file: string, tags: string[], body: string) {
  const rulesDir = path.join(repoRoot, ".zipline", "rules");
  const content = `---\ntags: [${tags.join(", ")}]\n---\n${body}`;
  fs.writeFileSync(path.join(rulesDir, file), content);
}

function gate_bloatDetectorExists() {
  // Gate 1: Module exports the detection and fix functions.
  assert.ok(typeof detectBloat === "function", "detectBloat function missing");
  assert.ok(typeof autoFixBloat === "function", "autoFixBloat function missing");
  assert.ok(typeof printBloatReport === "function", "printBloatReport function missing");
  console.log("✓ M24 gate 1: Bloat detector module exists");
}

function gate_detectsStructuralBloat() {
  const repo = makeTempRepo();

  // Overweight rule: >1500 tokens
  const bigBody = "A rule with excessive content.\n".repeat(300);
  writeRule(repo, "overweight.md", ["typescript"], bigBody);

  // Redundant pair: high token overlap
  const commonContent = "Security rules: sanitize all user input.\n".repeat(50);
  writeRule(repo, "security-a.md", ["security"], commonContent + "Extra A content.");
  writeRule(repo, "security-b.md", ["security"], commonContent + "Extra B content.");

  // Broad tag: one tag hits many rules
  for (let i = 0; i < 12; i++) {
    writeRule(repo, `broad-${i}.md`, ["broad"], `Rule ${i} content.`);
  }

  const report = detectBloat(repo);
  assert.ok(
    report.vectors.structural.overweightRules.length > 0,
    "Should detect overweight rule"
  );
  assert.ok(
    report.vectors.structural.redundantPairs.length > 0,
    "Should detect redundant pair"
  );
  assert.ok(report.vectors.structural.broadTags.length > 0, "Should detect broad tag");
  assert.ok(report.actionable.length > 0, "Should produce actionable items");

  fs.rmSync(repo, { recursive: true });
  console.log("✓ M24 gate 2: Detects structural bloat (overweight, redundancy, broad tags)");
}

function gate_detectsCacheIssues() {
  const repo = makeTempRepo();
  writeRule(repo, "typescript.md", ["typescript"], "TypeScript rules.");
  writeRule(repo, "security.md", ["security"], "Security rules.");

  // Simulate repeated identical compilations (same rules_included set).
  const identicalCompilation = {
    ts: new Date().toISOString(),
    milestone: "intercept",
    step: "user-prompt-submit",
    attempt: 1,
    tier: "n/a",
    tokens_in: 100,
    tokens_out: 0,
    baseline_tokens: 200,
    pass: true,
    metric: 0.5,
    outcome: "PASS" as const,
    retries: 0,
    rules_included: ["security.md", "typescript.md"],
    rules_excluded: [],
    note: "",
  };

  // Log 5 identical + 2 unique
  for (let i = 0; i < 5; i++) appendLedger(identicalCompilation, repo);
  appendLedger({ ...identicalCompilation, rules_included: ["security.md"] }, repo);
  appendLedger({ ...identicalCompilation, rules_included: ["typescript.md"] }, repo);

  const report = detectBloat(repo);
  assert.ok(report.vectors.cache.repeatedCompilations > 0, "Should detect repeated compilations");
  assert.ok(
    report.vectors.cache.cacheHitRate >= 0.5,
    "Should compute cache hit rate >= 50% with 5 repeats out of 7"
  );

  fs.rmSync(repo, { recursive: true });
  console.log("✓ M24 gate 3: Detects cache inefficiency (repeated compilations, hit rate)");
}

function gate_detectsCompressionDegradation() {
  const repo = makeTempRepo();
  writeRule(repo, "typescript.md", ["typescript"], "TypeScript rules.");

  // Simulate compression calls with declining savings over time.
  const base = {
    ts: new Date().toISOString(),
    milestone: "compress-output",
    step: "post-tool-use",
    attempt: 1,
    tier: "n/a",
    tokens_out: 0,
    pass: true,
    outcome: "PASS" as const,
    retries: 0,
    rules_included: [],
    rules_excluded: [],
    note: "",
  };

  // First 10 runs: 50% savings
  for (let i = 0; i < 10; i++) {
    appendLedger(
      { ...base, tokens_in: 500, baseline_tokens: 1000, metric: 0.5 },
      repo
    );
  }
  // Next 10 runs: 30% savings (degraded)
  for (let i = 0; i < 10; i++) {
    appendLedger(
      { ...base, tokens_in: 700, baseline_tokens: 1000, metric: 0.3 },
      repo
    );
  }

  const report = detectBloat(repo);
  assert.ok(report.vectors.compression.compressionCalls === 20, "Should count compression calls");
  assert.ok(
    report.vectors.compression.degradingTrend,
    "Should detect degrading compression savings"
  );

  fs.rmSync(repo, { recursive: true });
  console.log("✓ M24 gate 4: Detects compression degradation (declining savings trend)");
}

function gate_detectsEscalationSpirals() {
  const repo = makeTempRepo();
  writeRule(repo, "typescript.md", ["typescript"], "TypeScript rules.");

  // Simulate a step that escalates repeatedly without settling.
  const base = {
    ts: new Date().toISOString(),
    milestone: "build",
    step: "implement-feature",
    attempt: 1,
    tokens_in: 100,
    tokens_out: 200,
    baseline_tokens: 200,
    pass: false,
    metric: 0.5,
    outcome: "FAIL" as const,
    retries: 1,
    rules_included: ["typescript.md"],
    rules_excluded: [],
    note: "",
  };

  // Log 20 entries with tier escalations: haiku → sonnet → opus → haiku → ...
  const tiers = ["haiku", "sonnet", "opus"];
  for (let i = 0; i < 20; i++) {
    appendLedger({ ...base, tier: tiers[i % 3] }, repo);
  }

  const report = detectBloat(repo);
  assert.ok(report.vectors.escalation.spirals.length > 0, "Should detect escalation spiral");
  assert.ok(
    report.vectors.escalation.spirals[0].neverSettled,
    "Should flag spiral as never settled"
  );
  assert.strictEqual(report.severity, "critical", "Spirals should elevate severity to critical");

  fs.rmSync(repo, { recursive: true });
  console.log("✓ M24 gate 5: Detects escalation spirals (repeated escalations, never settled)");
}

function gate_autoFixAppliesSafely() {
  const repo = makeTempRepo();

  // Overweight rule that can be split at headings (needs >1500 tokens).
  const sectionA = "Rule A content that needs to be substantial enough to split properly.\n".repeat(200);
  const sectionB = "Rule B content that also needs significant size for the split.\n".repeat(200);
  const bigBody = `# Section A\n${sectionA}\n# Section B\n${sectionB}`;
  writeRule(repo, "overweight.md", ["typescript"], bigBody);

  // Redundant pair.
  const commonContent = "Common security rules.\n".repeat(50);
  writeRule(repo, "security-a.md", ["security"], commonContent + "Unique A.");
  writeRule(repo, "security-b.md", ["security"], commonContent + "Unique B.");

  // Dry-run: no files modified.
  const dryFixes = autoFixBloat(repo, true);
  assert.ok(dryFixes.length > 0, "Dry-run should report fixable issues");
  assert.ok(
    fs.existsSync(path.join(repo, ".zipline", "rules", "overweight.md")),
    "Dry-run should not delete files"
  );

  // Real run: files modified.
  const fixes = autoFixBloat(repo, false);
  assert.ok(fixes.length > 0, "Should apply fixes");

  // Verify split happened (overweight.md → parts).
  const rulesAfter = loadRules(repo);
  assert.ok(rulesAfter.length > 2, "Should have split the overweight rule");

  // Verify merge happened (security-a.md absorbed security-b.md).
  assert.ok(
    !fs.existsSync(path.join(repo, ".zipline", "rules", "security-b.md")),
    "Redundant rule should be removed"
  );
  assert.ok(
    fs.existsSync(path.join(repo, ".zipline", "rules", "security-a.md")),
    "Primary rule should remain"
  );

  fs.rmSync(repo, { recursive: true });
  console.log("✓ M24 gate 6: Auto-fix safely splits and merges rules");
}

function gate_reportRendersActionableItems() {
  const repo = makeTempRepo();

  // Create a bloat scenario: overweight rule + redundant pair + broad tag.
  const bigBody = "A rule with excessive content.\n".repeat(300);
  writeRule(repo, "overweight.md", ["typescript"], bigBody);

  const commonContent = "Common content.\n".repeat(50);
  writeRule(repo, "rule-a.md", ["security"], commonContent + "A");
  writeRule(repo, "rule-b.md", ["security"], commonContent + "B");

  for (let i = 0; i < 12; i++) {
    writeRule(repo, `broad-${i}.md`, ["broad"], `Content ${i}.`);
  }

  const report = detectBloat(repo);
  assert.ok(report.actionable.length >= 3, "Should produce ≥3 actionable items");
  assert.ok(
    report.actionable.some((a) => a.includes("Split")),
    "Should recommend splitting overweight rule"
  );
  assert.ok(
    report.actionable.some((a) => a.includes("Merge") || a.includes("dedup")),
    "Should recommend merging redundant pair"
  );
  assert.ok(
    report.actionable.some((a) => a.includes("Narrow") || a.includes("broad")),
    "Should recommend narrowing broad tag"
  );

  // Verify printBloatReport doesn't throw.
  const oldLog = console.log;
  const logs: string[] = [];
  console.log = (msg: string) => logs.push(msg);
  printBloatReport(repo);
  console.log = oldLog;
  assert.ok(logs.length > 0, "printBloatReport should emit output");
  assert.ok(
    logs.some((l) => l.includes("ACTIONABLE")),
    "Report should include actionable section"
  );

  fs.rmSync(repo, { recursive: true });
  console.log("✓ M24 gate 7: Report renders human-readable actionable items");
}

function runM24Gates() {
  console.log("Running M24 gates (Context Bloat Detection & Prevention)...\n");
  gate_bloatDetectorExists();
  gate_detectsStructuralBloat();
  gate_detectsCacheIssues();
  gate_detectsCompressionDegradation();
  gate_detectsEscalationSpirals();
  gate_autoFixAppliesSafely();
  gate_reportRendersActionableItems();
  console.log("\n✓ ALL M24 GATES PASSED");
}

if (require.main === module) {
  runM24Gates();
}

export { runM24Gates };
