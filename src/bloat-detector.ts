import { readLedger, LedgerEntry } from "./ledger";
import { loadRules } from "./compiler";
import { encode } from "gpt-tokenizer";
import * as fs from "fs";
import * as path from "path";
import { rulesDir } from "./paths";

// M24: Context Bloat Detection & Prevention
//
// Detects four bloat vectors that can silently erode claude0's savings:
//
// 1. STRUCTURAL BLOAT — rules growing without bound, redundant content, overly
//    broad tags (causing over-selection). Measured: per-rule token size, token
//    overlap between rules, tag fan-out (how many rules each tag hits).
//
// 2. CACHE INEFFICIENCY — repeated identical compilations (should be cached but
//    aren't), cache-miss rate climbing, full-context fallbacks.
//
// 3. COMPRESSION DEGRADATION — output compression failing to fire, or firing but
//    delivering shrinking net savings.
//
// 4. ESCALATION SPIRAL — a step that perpetually escalates and never settles,
//    burning context & cost without learning.
//
// Detection is cheap (one ledger read + one rules scan); reports are actionable
// (which rule to split, which cache to tune, which step to cap).

export interface BloatReport {
  timestamp: string;
  vectors: {
    structural: StructuralBloat;
    cache: CacheIssues;
    compression: CompressionIssues;
    escalation: EscalationIssues;
  };
  actionable: string[];
  severity: "ok" | "warning" | "critical";
}

export interface StructuralBloat {
  overweightRules: Array<{ file: string; tokens: number; threshold: number }>;
  redundantPairs: Array<{ a: string; b: string; overlapPct: number }>;
  broadTags: Array<{ tag: string; ruleCount: number; threshold: number }>;
}

export interface CacheIssues {
  repeatedCompilations: number;
  uniqueCompilations: number;
  cacheHitRate: number; // ideal: high; <0.5 is waste
}

export interface CompressionIssues {
  compressionCalls: number;
  totalSavings: number;
  avgSavingsPct: number;
  degradingTrend: boolean; // true if last 10 runs show declining savings
}

export interface EscalationIssues {
  spirals: Array<{
    step: string;
    escalations: number; // count of tier-ups within a window
    neverSettled: boolean; // true if no PASS at the escalated tier
  }>;
}

const OVERWEIGHT_RULE_THRESHOLD = 1500; // tokens — a rule over this should split
const BROAD_TAG_THRESHOLD = 10; // rules — a tag hitting this many rules is overly broad
const REDUNDANCY_THRESHOLD = 0.6; // token-overlap fraction above which two rules are redundant
const SPIRAL_WINDOW = 20; // ledger entries to look back for spirals
const SPIRAL_ESCALATION_THRESHOLD = 3; // escalations within the window → spiral

export function detectBloat(repoRoot: string): BloatReport {
  const rules = loadRules(repoRoot);
  const ledger = readLedger(repoRoot);

  const structural = detectStructuralBloat(rules);
  const cache = detectCacheIssues(ledger);
  const compression = detectCompressionIssues(ledger);
  const escalation = detectEscalationSpirals(ledger);

  const actionable: string[] = [];
  let severity: "ok" | "warning" | "critical" = "ok";

  // Build actionable items based on findings.
  if (structural.overweightRules.length > 0) {
    severity = "warning";
    structural.overweightRules.forEach((r) => {
      actionable.push(`Split ${r.file} (${r.tokens} tokens > ${r.threshold})`);
    });
  }
  if (structural.redundantPairs.length > 0) {
    severity = severity === "ok" ? "warning" : severity;
    structural.redundantPairs.forEach((p) => {
      actionable.push(`Merge or dedup ${p.a} ↔ ${p.b} (${(p.overlapPct * 100).toFixed(0)}% overlap)`);
    });
  }
  if (structural.broadTags.length > 0) {
    structural.broadTags.forEach((t) => {
      actionable.push(
        `Narrow tag '${t.tag}' (hits ${t.ruleCount} rules > ${t.threshold}) or split the rules`
      );
    });
  }

  if (cache.cacheHitRate < 0.5 && cache.uniqueCompilations > 10) {
    if (severity === "ok") severity = "warning";
    actionable.push(
      `Cache hit rate ${(cache.cacheHitRate * 100).toFixed(0)}% < 50% — consider memoizing compile() calls`
    );
  }

  if (compression.degradingTrend && compression.compressionCalls > 10) {
    if (severity === "ok") severity = "warning";
    actionable.push(
      `Compression savings declining (avg ${compression.avgSavingsPct.toFixed(1)}%) — check rtk or filters`
    );
  }

  if (escalation.spirals.length > 0) {
    severity = "critical";
    escalation.spirals.forEach((s) => {
      actionable.push(
        `Step '${s.step}' spiraling (${s.escalations} escalations, ${s.neverSettled ? "never settled" : "unstable"})`
      );
    });
  }

  if (actionable.length === 0) {
    actionable.push("No bloat detected — system is healthy");
  }

  return {
    timestamp: new Date().toISOString(),
    vectors: { structural, cache, compression, escalation },
    actionable,
    severity,
  };
}

function detectStructuralBloat(rules: ReturnType<typeof loadRules>): StructuralBloat {
  const overweightRules: StructuralBloat["overweightRules"] = [];
  const redundantPairs: StructuralBloat["redundantPairs"] = [];
  const tagCounts = new Map<string, number>();

  const tokenizedRules = rules.map((r) => ({
    file: r.file,
    tokens: encode(r.body).length,
    tokenSet: new Set(encode(r.body)),
    tags: r.tags,
  }));

  // 1. Overweight rules
  tokenizedRules.forEach((r) => {
    if (r.tokens > OVERWEIGHT_RULE_THRESHOLD) {
      overweightRules.push({ file: r.file, tokens: r.tokens, threshold: OVERWEIGHT_RULE_THRESHOLD });
    }
  });

  // 2. Redundant pairs (high token overlap)
  for (let i = 0; i < tokenizedRules.length; i++) {
    for (let j = i + 1; j < tokenizedRules.length; j++) {
      const a = tokenizedRules[i];
      const b = tokenizedRules[j];
      const intersection = new Set([...a.tokenSet].filter((t) => b.tokenSet.has(t)));
      const union = new Set([...a.tokenSet, ...b.tokenSet]);
      const overlap = intersection.size / union.size;
      if (overlap >= REDUNDANCY_THRESHOLD) {
        redundantPairs.push({ a: a.file, b: b.file, overlapPct: overlap });
      }
    }
  }

  // 3. Broad tags
  rules.forEach((r) => {
    r.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) || 0) + 1));
  });
  const broadTags: StructuralBloat["broadTags"] = [];
  tagCounts.forEach((count, tag) => {
    if (count > BROAD_TAG_THRESHOLD) {
      broadTags.push({ tag, ruleCount: count, threshold: BROAD_TAG_THRESHOLD });
    }
  });

  return { overweightRules, redundantPairs, broadTags };
}

function detectCacheIssues(ledger: LedgerEntry[]): CacheIssues {
  // A "compilation" is uniquely identified by the set of rules_included (sorted).
  // Repeated identical sets should ideally be cached, not recomputed.
  const compilations = ledger
    .filter((e) => e.step === "user-prompt-submit" && e.rules_included.length > 0)
    .map((e) => e.rules_included.slice().sort().join(","));

  const unique = new Set(compilations);
  const repeated = compilations.length - unique.size;
  const hitRate = compilations.length > 0 ? repeated / compilations.length : 1;

  return {
    repeatedCompilations: repeated,
    uniqueCompilations: unique.size,
    cacheHitRate: hitRate,
  };
}

function detectCompressionIssues(ledger: LedgerEntry[]): CompressionIssues {
  const compressions = ledger.filter((e) => e.step === "post-tool-use" && e.baseline_tokens > 0);

  if (compressions.length === 0) {
    return { compressionCalls: 0, totalSavings: 0, avgSavingsPct: 0, degradingTrend: false };
  }

  const totalSavings = compressions.reduce((sum, e) => sum + e.metric, 0);
  const avgSavingsPct = (totalSavings / compressions.length) * 100;

  // Trend: compare last 10 vs prior 10 (if we have ≥20 entries).
  let degradingTrend = false;
  if (compressions.length >= 20) {
    const recent = compressions.slice(-10);
    const prior = compressions.slice(-20, -10);
    const recentAvg = recent.reduce((sum, e) => sum + e.metric, 0) / recent.length;
    const priorAvg = prior.reduce((sum, e) => sum + e.metric, 0) / prior.length;
    degradingTrend = recentAvg < priorAvg * 0.8; // 20% decline
  }

  return {
    compressionCalls: compressions.length,
    totalSavings,
    avgSavingsPct,
    degradingTrend,
  };
}

function detectEscalationSpirals(ledger: LedgerEntry[]): EscalationIssues {
  // Group ledger entries by step, then look for repeated tier escalations within
  // the rolling window without ever settling (i.e., never achieving a stable PASS).
  const byStep = new Map<string, LedgerEntry[]>();
  ledger.forEach((e) => {
    const key = `${e.milestone}:${e.step}`;
    if (!byStep.has(key)) byStep.set(key, []);
    byStep.get(key)!.push(e);
  });

  const spirals: EscalationIssues["spirals"] = [];

  byStep.forEach((entries, step) => {
    if (entries.length < SPIRAL_WINDOW) return;

    const window = entries.slice(-SPIRAL_WINDOW);
    const escalations = countEscalations(window);
    const settled = window.some((e) => e.pass && e.retries === 0);

    if (escalations >= SPIRAL_ESCALATION_THRESHOLD && !settled) {
      spirals.push({ step, escalations, neverSettled: true });
    } else if (escalations >= SPIRAL_ESCALATION_THRESHOLD) {
      spirals.push({ step, escalations, neverSettled: false });
    }
  });

  return { spirals };
}

function countEscalations(entries: LedgerEntry[]): number {
  let count = 0;
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];
    // Escalation = tier went up or effort went up (both are cost increases).
    if (tierRank(curr.tier) > tierRank(prev.tier)) count++;
    if (effortRank(curr.effort) > effortRank(prev.effort)) count++;
  }
  return count;
}

function tierRank(tier: string): number {
  const ranks: Record<string, number> = { haiku: 1, sonnet: 2, opus: 3, fable: 4, "n/a": 0 };
  return ranks[tier] ?? 0;
}

function effortRank(effort?: string): number {
  const ranks: Record<string, number> = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 };
  return effort ? ranks[effort] ?? 0 : 0;
}

// CLI + hook entrypoint: run detection and emit a human-readable report.
export function printBloatReport(repoRoot: string): void {
  const report = detectBloat(repoRoot);
  console.log(`claude0 Bloat Report (${report.timestamp})`);
  console.log(`Severity: ${report.severity.toUpperCase()}\n`);

  console.log("STRUCTURAL BLOAT");
  console.log(
    `  Overweight rules: ${report.vectors.structural.overweightRules.length} (>${OVERWEIGHT_RULE_THRESHOLD} tokens)`
  );
  console.log(
    `  Redundant pairs:  ${report.vectors.structural.redundantPairs.length} (>${(REDUNDANCY_THRESHOLD * 100).toFixed(0)}% overlap)`
  );
  console.log(
    `  Broad tags:       ${report.vectors.structural.broadTags.length} (>${BROAD_TAG_THRESHOLD} rules)`
  );

  console.log("\nCACHE EFFICIENCY");
  console.log(`  Repeated compilations: ${report.vectors.cache.repeatedCompilations}`);
  console.log(`  Unique compilations:   ${report.vectors.cache.uniqueCompilations}`);
  console.log(`  Cache hit rate:        ${(report.vectors.cache.cacheHitRate * 100).toFixed(1)}%`);

  console.log("\nCOMPRESSION");
  console.log(`  Compression calls:  ${report.vectors.compression.compressionCalls}`);
  console.log(`  Avg savings:        ${report.vectors.compression.avgSavingsPct.toFixed(1)}%`);
  console.log(`  Degrading trend:    ${report.vectors.compression.degradingTrend ? "YES" : "no"}`);

  console.log("\nESCALATION SPIRALS");
  console.log(`  Spiraling steps:    ${report.vectors.escalation.spirals.length}`);
  report.vectors.escalation.spirals.forEach((s) => {
    console.log(
      `    - ${s.step}: ${s.escalations} escalations${s.neverSettled ? " (never settled)" : ""}`
    );
  });

  console.log("\nACTIONABLE ITEMS");
  report.actionable.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));
  console.log("");
}

// Auto-fix: apply safe, deterministic fixes to the detected bloat (splitting
// overweight rules, deduping redundant content). Writes changes to disk; the
// caller decides when to invoke this (e.g., `claude0 bloat --fix`).
export function autoFixBloat(repoRoot: string, dryRun = true): string[] {
  const report = detectBloat(repoRoot);
  const fixes: string[] = [];

  // Fix 1: Split overweight rules at natural boundaries (blank lines or headings).
  report.vectors.structural.overweightRules.forEach((r) => {
    const rulePath = path.join(rulesDir(repoRoot), r.file);
    const content = fs.readFileSync(rulePath, "utf8");
    const parts = splitRule(content);
    if (parts.length > 1) {
      if (!dryRun) {
        parts.forEach((part, i) => {
          const newFile = r.file.replace(/\.md$/, `-${i + 1}.md`);
          fs.writeFileSync(path.join(rulesDir(repoRoot), newFile), part);
        });
        fs.unlinkSync(rulePath);
      }
      fixes.push(`Split ${r.file} → ${parts.length} parts (${r.tokens} tokens)`);
    }
  });

  // Fix 2: Merge redundant pairs (pick the first, append unique content from second).
  report.vectors.structural.redundantPairs.forEach((p) => {
    const aPath = path.join(rulesDir(repoRoot), p.a);
    const bPath = path.join(rulesDir(repoRoot), p.b);
    const aContent = fs.readFileSync(aPath, "utf8");
    const bContent = fs.readFileSync(bPath, "utf8");
    const merged = mergeRules(aContent, bContent);
    if (!dryRun) {
      fs.writeFileSync(aPath, merged);
      fs.unlinkSync(bPath);
    }
    fixes.push(`Merged ${p.b} into ${p.a} (${(p.overlapPct * 100).toFixed(0)}% overlap)`);
  });

  return fixes;
}

function splitRule(content: string): string[] {
  // Split at markdown headings (# Section).
  const parts: string[] = [];
  const lines = content.split("\n");
  let current: string[] = [];
  let inFrontmatter = false;
  let frontmatter = "";
  let seenFrontmatter = false;

  for (const line of lines) {
    if (line === "---") {
      if (!inFrontmatter) {
        inFrontmatter = true;
        frontmatter += line + "\n";
      } else {
        inFrontmatter = false;
        frontmatter += line + "\n";
        seenFrontmatter = true;
      }
      continue;
    }
    if (inFrontmatter) {
      frontmatter += line + "\n";
      continue;
    }

    // Split at headings (start a new part when we hit a heading).
    if (seenFrontmatter && line.startsWith("#") && current.length > 0) {
      parts.push(frontmatter + current.join("\n").trim());
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) parts.push(frontmatter + current.join("\n").trim());

  // Only split if we get ≥2 reasonable-sized parts (each >200 tokens).
  const viable = parts.filter((p) => encode(p).length > 200);
  return viable.length >= 2 ? viable : [content];
}

function mergeRules(a: string, b: string): string {
  // Extract frontmatter + body, take A's tags union B's tags, append unique lines.
  const aMatch = a.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  const bMatch = b.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!aMatch || !bMatch) return a; // malformed, bail

  const aTags = aMatch[1].match(/tags:\s*\[([^\]]*)\]/)?.[1].split(",").map((t) => t.trim()) || [];
  const bTags = bMatch[1].match(/tags:\s*\[([^\]]*)\]/)?.[1].split(",").map((t) => t.trim()) || [];
  const mergedTags = [...new Set([...aTags, ...bTags])];

  const aBody = aMatch[2].trim();
  const bBody = bMatch[2].trim();
  const aLines = new Set(aBody.split("\n"));
  const uniqueB = bBody
    .split("\n")
    .filter((line) => !aLines.has(line))
    .join("\n");

  const newFrontmatter = `---\ntags: [${mergedTags.join(", ")}]\n---\n`;
  return newFrontmatter + aBody + (uniqueB ? "\n\n" + uniqueB : "");
}
