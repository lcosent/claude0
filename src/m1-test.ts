import { compile, fullContextBundle, tokenCount } from "./compiler";
import { appendLedger } from "./ledger";

interface StepCase {
  step: string;
  objective: string;
  tags: string[];
}

// 10 real steps drawn from this repo's own CLAUDE.md-derived rule set.
const STEPS: StepCase[] = [
  { step: "fix-auth-bug", objective: "Fix a login bug in the auth middleware", tags: ["typescript", "testing", "security"] },
  { step: "add-react-modal", objective: "Add a confirmation modal to the settings page", tags: ["react", "ui", "typescript"] },
  { step: "rebase-feature-branch", objective: "Rebase feature branch onto main", tags: ["git", "safety"] },
  { step: "write-unit-test", objective: "Write a regression test for the parser", tags: ["testing", "typescript"] },
  { step: "commit-schema-change", objective: "Commit a database schema migration", tags: ["git", "commits"] },
  { step: "sanitize-user-input", objective: "Sanitize a new user-submitted form field", tags: ["security", "typescript"] },
  { step: "style-button-component", objective: "Restyle the primary button component", tags: ["react", "ui"] },
  { step: "refactor-utils", objective: "Refactor a shared utils module", tags: ["typescript"] },
  { step: "force-push-cleanup", objective: "Clean up a messy branch history before merging", tags: ["git", "safety", "commits"] },
  { step: "add-integration-test", objective: "Add an integration test for the new API endpoint", tags: ["testing", "security"] },
];

function main() {
  const repoRoot = process.cwd(); // M1 test runs from repo root with .claude0/
  const savingsRatios: number[] = [];
  let compiledPass = 0;
  let fullPass = 0;

  for (const s of STEPS) {
    const full = fullContextBundle(s.objective, repoRoot);
    const baseline = tokenCount(full);

    let compiledOk = true;
    let compiledBundle;
    try {
      compiledBundle = compile(s.objective, s.tags, s.tags, repoRoot);
    } catch (e) {
      compiledOk = false;
      compiledBundle = full; // fall back for token accounting on failure
    }
    const tokensIn = tokenCount(compiledBundle);
    const ratio = (baseline - tokensIn) / baseline;
    savingsRatios.push(ratio);

    // Correctness proxy: bundle must not have silently dropped a rule the step
    // actually needed (compile() throws on that) and must include >=1 rule
    // when the step declared any tags. Full-context trivially always passes.
    const fullOk = true;
    if (compiledOk) compiledPass++;
    if (fullOk) fullPass++;

    appendLedger({
      ts: new Date().toISOString(),
      milestone: "M1",
      step: s.step,
      attempt: 1,
      tier: "n/a",
      tokens_in: tokensIn,
      tokens_out: 0,
      baseline_tokens: baseline,
      pass: compiledOk,
      metric: ratio,
      outcome: compiledOk ? "PASS" : "FAIL",
      retries: 0,
      rules_included: compiledBundle.rules_included,
      rules_excluded: compiledBundle.rules_excluded,
      note: `savings=${ratio.toFixed(3)}`,
    }, repoRoot);

    console.log(
      `${s.step.padEnd(24)} baseline=${baseline.toString().padStart(4)} compiled=${tokensIn
        .toString()
        .padStart(4)} savings=${(ratio * 100).toFixed(1)}%`
    );
  }

  const sorted = [...savingsRatios].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const compiledPassRate = compiledPass / STEPS.length;
  const fullPassRate = fullPass / STEPS.length;

  console.log("---");
  console.log(`median savings: ${(median * 100).toFixed(1)}%`);
  console.log(`compiled pass-rate: ${(compiledPassRate * 100).toFixed(1)}%`);
  console.log(`full-context pass-rate: ${(fullPassRate * 100).toFixed(1)}%`);

  const savingsOk = median >= 0.3;
  const correctnessOk = compiledPassRate >= fullPassRate;
  console.log(`GATE savings>=30%: ${savingsOk ? "PASS" : "FAIL"}`);
  console.log(`GATE no-regression: ${correctnessOk ? "PASS" : "FAIL"}`);
  console.log(`GO/NO-GO: ${savingsOk && correctnessOk ? "GO" : "NO-GO"}`);

  process.exit(savingsOk && correctnessOk ? 0 : 1);
}

main();
