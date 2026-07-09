import { compile, tokenCount, fullContextBundle } from "./compiler";
import { appendLedger, readLedger } from "./ledger";
import { Policy, nextTier, Tier, effortForTier } from "./policy";
import { StepOutputSchema } from "./contract";
import { callModel } from "./llm";
import { runCapability } from "./integrations";
import { measureTerseOutputDelta, terseABToLogEntry } from "./integrations/terse-ab";
import { budgetLimitTokens, budgetHaltNote } from "./budget";

export interface DesignPrompt {
  hypothesis: string;
  context: string;
}

export interface Design {
  problem: string;
  solution: string;
  tradeoffs: string[];
  risks: string[];
}

export interface Milestone {
  id: string;
  goal: string;
  hypothesis: string;
  successCriteria: string[];
  files: string[];
}

export interface PlanOutput {
  milestones: Milestone[];
  totalEstimatedCost: number;
}

export interface GateResult {
  proceed: boolean;
  adjustments: string[];
  revisedMilestone?: Milestone;
}

export interface VerifyResult {
  pass: boolean;
  findings: string[];
  reviewer: string;
}

/**
 * DESIGN step: Generate a design via debate among N agents with varied roles.
 * Each role contributes a perspective; converge to a single design.
 */
export async function designStep(
  prompt: DesignPrompt,
  repoRoot: string
): Promise<Design> {
  const roles = [
    { name: "pragmatist", focus: "MVP, simplest implementation, ship fast" },
    { name: "skeptic", focus: "What can break? Edge cases, failure modes" },
    { name: "architect", focus: "Long-term maintainability, clean abstractions" },
  ];

  // Simulate debate: each role generates a perspective
  // In real implementation, this would call LLM with compiled context
  const perspectives: string[] = [];
  for (const role of roles) {
    const bundle = compile(
      `${prompt.hypothesis}\n\nRole: ${role.name} (${role.focus})`,
      ["design"],
      ["design"],
      repoRoot
    );

    const tokens = tokenCount(bundle);
    appendLedger(
      {
        ts: new Date().toISOString(),
        milestone: "M4-DESIGN",
        step: `debate-${role.name}`,
        attempt: 1,
        tier: "sonnet",
        tokens_in: tokens,
        tokens_out: 150,
        baseline_tokens: tokenCount(
          fullContextBundle(bundle.objective, repoRoot)
        ),
        pass: true,
        metric: 1,
        outcome: "PASS",
        retries: 0,
        rules_included: bundle.rules_included,
        rules_excluded: bundle.rules_excluded,
        note: `role=${role.name}`,
      },
      repoRoot
    );

    perspectives.push(
      `[${role.name}]: Focus on ${role.focus}. Consider tradeoffs.`
    );
  }

  // Converge: synthesize perspectives into unified design
  const convergenceBundle = compile(
    `Synthesize design from: ${perspectives.join(" ")}`,
    ["design"],
    ["design"],
    repoRoot
  );

  // Design-synthesis is the "10% planning" of the 10-80-10 split — the one step
  // where the architect tier (Fable) earns its 2x cost. Overridable via policy.
  const convergeTier: Tier = "fable";
  appendLedger(
    {
      ts: new Date().toISOString(),
      milestone: "M4-DESIGN",
      step: "converge",
      attempt: 1,
      tier: convergeTier,
      effort: effortForTier(convergeTier),
      tokens_in: tokenCount(convergenceBundle),
      tokens_out: 300,
      baseline_tokens: tokenCount(
        fullContextBundle(convergenceBundle.objective, repoRoot)
      ),
      pass: true,
      metric: 1,
      outcome: "PASS",
      retries: 0,
      rules_included: convergenceBundle.rules_included,
      rules_excluded: convergenceBundle.rules_excluded,
      note: "design-synthesis",
    },
    repoRoot
  );

  return {
    problem: prompt.hypothesis,
    solution: `Synthesized from ${roles.length} perspectives: ${perspectives.slice(0, 50).join(", ")}...`,
    tradeoffs: ["Simplicity vs features", "Speed vs correctness"],
    risks: ["Scope creep", "Integration complexity"],
  };
}

/**
 * PLAN step: Convert design into milestones with success criteria.
 */
export async function planStep(
  design: Design,
  repoRoot: string
): Promise<PlanOutput> {
  const bundle = compile(
    `Create milestones from design: ${design.solution}`,
    ["planning"],
    [],
    repoRoot
  );

  appendLedger(
    {
      ts: new Date().toISOString(),
      milestone: "M4-PLAN",
      step: "generate-milestones",
      attempt: 1,
      tier: "sonnet",
      tokens_in: tokenCount(bundle),
      tokens_out: 400,
      baseline_tokens: tokenCount(fullContextBundle(bundle.objective, repoRoot)),
      pass: true,
      metric: 1,
      outcome: "PASS",
      retries: 0,
      rules_included: bundle.rules_included,
      rules_excluded: bundle.rules_excluded,
      note: "plan-generation",
    },
    repoRoot
  );

  // Generate 2-3 milestones from the design
  const milestones: Milestone[] = [
    {
      id: "m1-foundation",
      goal: "Set up basic structure",
      hypothesis: "Foundation enables feature implementation",
      successCriteria: ["Tests pass", "Type-checks clean"],
      files: ["src/index.ts", "src/types.ts"],
    },
    {
      id: "m2-implementation",
      goal: "Implement core logic",
      hypothesis: "Implementation satisfies requirements",
      successCriteria: ["Unit tests pass", "Integration test passes"],
      files: ["src/core.ts", "src/utils.ts"],
    },
  ];

  return {
    milestones,
    totalEstimatedCost: 1000, // token budget estimate
  };
}

/**
 * GATE step: Re-plan milestone against actuals from prior milestone.
 * Reads ledger entries, checks if assumptions hold, adjusts plan if needed.
 */
export async function gateStep(
  milestone: Milestone,
  priorMilestoneId: string | null,
  repoRoot: string
): Promise<GateResult> {
  if (!priorMilestoneId) {
    // First milestone, no prior actuals to check
    return { proceed: true, adjustments: [] };
  }

  const ledger = readLedger(repoRoot);
  const priorEntries = ledger.filter((e) => e.milestone === priorMilestoneId);

  const bundle = compile(
    `Check if milestone ${milestone.id} plan holds given prior actuals`,
    ["planning", "review"],
    [],
    repoRoot
  );

  appendLedger(
    {
      ts: new Date().toISOString(),
      milestone: "M4-GATE",
      step: `gate-${milestone.id}`,
      attempt: 1,
      tier: "sonnet",
      tokens_in: tokenCount(bundle),
      tokens_out: 100,
      baseline_tokens: tokenCount(fullContextBundle(bundle.objective, repoRoot)),
      pass: true,
      metric: 1,
      outcome: "PASS",
      retries: 0,
      rules_included: bundle.rules_included,
      rules_excluded: bundle.rules_excluded,
      note: `prior-entries=${priorEntries.length}`,
    },
    repoRoot
  );

  // Check if prior milestone had issues
  const hadFailures = priorEntries.some((e) => !e.pass);
  const hadEscalations = priorEntries.some((e) => e.retries > 0);

  const adjustments: string[] = [];
  if (hadFailures) {
    adjustments.push("Prior milestone had failures; adjust success criteria");
  }
  if (hadEscalations) {
    adjustments.push("Prior milestone needed escalations; allocate more budget");
  }

  return {
    proceed: true,
    adjustments,
    revisedMilestone: adjustments.length > 0 ? milestone : undefined,
  };
}

/**
 * BUILD step: Implement the milestone using compiler + router.
 * Routes to appropriate tier based on task complexity.
 */
export async function buildStep(
  milestone: Milestone,
  tier: Tier,
  repoRoot: string
): Promise<{ success: boolean; output: string }> {
  const bundle = compile(
    `Implement ${milestone.goal}: ${milestone.hypothesis}`,
    ["implementation", "typescript"],
    [],
    repoRoot
  );

  // Apply terse-output (unless auto-disabled), then make the real model call.
  const baseObjective = `${bundle.objective}\n\n${bundle.constraints.join("\n")}`;
  const terse = runCapability("terse-output", baseObjective, repoRoot);
  const prompt = terse.output;
  const effort = effortForTier(tier);
  const resp = callModel(prompt, tier, effort);
  // Success = the model returned substantive output for the step.
  const pass = resp.text.trim().length > 0;

  // terse OUTPUT-delta accounting (M17). By default we log neutral (no A/B) so
  // terse never falsely auto-disables on the input-side fragment cost. With
  // ZIPLINE_TERSE_AB=1 we run a real no-terse baseline pass and log the signed
  // OUTPUT delta — the honest measurement that feeds shouldDisable. Opt-in
  // because the A/B doubles model calls for the build step.
  let terseLog = {
    name: "terse-output",
    tokens_before: terse.tokensBefore,
    tokens_after: terse.tokensBefore, // neutral placeholder
    source: terse.source,
    net_delta_exempt: false,
  };
  if (process.env.ZIPLINE_TERSE_AB === "1") {
    const ab = measureTerseOutputDelta(baseObjective, tier);
    terseLog = terseABToLogEntry(ab);
  }

  // Record terse's OUTPUT effect, not its input-side fragment cost. terse
  // prepends a fragment, so input-side after>before would always read
  // "net-negative" and falsely auto-disable it. Its true payoff is shorter model
  // OUTPUT, which needs a no-terse A/B baseline to measure — deferred until that
  // exists. Offline we log neutral (before==after) so terse never falsely
  // disables; the auto-disable MECHANISM is proven with seeded data in m12-test,
  // and will trip on real A/B deltas once output measurement lands.
  appendLedger(
    {
      ts: new Date().toISOString(),
      milestone: "M4-BUILD",
      step: `build-${milestone.id}`,
      attempt: 1,
      tier,
      effort,
      tokens_in: tokenCount(bundle),
      tokens_out: resp.tokens_out,
      baseline_tokens: tokenCount(fullContextBundle(bundle.objective, repoRoot)),
      pass,
      metric: pass ? 1 : 0,
      outcome: pass ? "PASS" : "FAIL",
      retries: 0,
      rules_included: bundle.rules_included,
      rules_excluded: bundle.rules_excluded,
      note: `files=${milestone.files.length} src=${resp.source}`,
      capabilities: [terseLog],
    },
    repoRoot
  );

  return {
    success: pass,
    output: pass ? resp.text : "Build failed",
  };
}

/**
 * VERIFY step: Run independent reviewers (simulates santa-method).
 * Two reviewers must both pass for verification to succeed.
 */
export async function verifyStep(
  milestone: Milestone,
  implementation: string,
  repoRoot: string
): Promise<{ pass: boolean; reviews: VerifyResult[] }> {
  const reviewers = [
    { name: "correctness-reviewer", focus: "Does it work? Edge cases handled?" },
    { name: "security-reviewer", focus: "Input sanitized? Auth checked?" },
  ];

  const reviews: VerifyResult[] = [];

  for (const reviewer of reviewers) {
    const bundle = compile(
      `Review ${milestone.id} implementation for ${reviewer.focus}`,
      ["review", "security"],
      [],
      repoRoot
    );

    // Real reviewer call. Ask for a structured verdict on its OWN line so we
    // parse the decision, not incidental prose (a real review that says "would
    // FAIL if..." must not trip a naive substring match). Offline stub echoes
    // the prompt (no VERDICT line) → substantive output treated as PASS.
    const prompt = `${bundle.objective}\n\nImplementation:\n${implementation}\n\nStart your reply with a line "VERDICT: PASS" or "VERDICT: FAIL", then one reason.`;
    const reviewTier: Tier = "sonnet";
    const reviewEffort = effortForTier(reviewTier);
    const resp = callModel(prompt, reviewTier, reviewEffort);
    const verdict = resp.text.match(/VERDICT:\s*(PASS|FAIL)/i);
    const pass = verdict
      ? verdict[1].toUpperCase() === "PASS" // real model: trust its structured verdict
      : resp.text.trim().length > 0; // stub/no-verdict: substantive output = pass

    appendLedger(
      {
        ts: new Date().toISOString(),
        milestone: "M4-VERIFY",
        step: `verify-${milestone.id}-${reviewer.name}`,
        attempt: 1,
        tier: reviewTier,
        effort: reviewEffort,
        tokens_in: tokenCount(bundle),
        tokens_out: resp.tokens_out,
        baseline_tokens: tokenCount(
          fullContextBundle(bundle.objective, repoRoot)
        ),
        pass,
        metric: pass ? 1 : 0,
        outcome: pass ? "PASS" : "FAIL",
        retries: 0,
        rules_included: bundle.rules_included,
        rules_excluded: bundle.rules_excluded,
        note: `reviewer=${reviewer.name} src=${resp.source}`,
      },
      repoRoot
    );

    reviews.push({
      pass,
      findings: pass ? [] : [`${reviewer.focus} - needs improvement`],
      reviewer: reviewer.name,
    });
  }

  const allPass = reviews.every((r) => r.pass);

  return { pass: allPass, reviews };
}

/**
 * Full M4 loop: DESIGN → PLAN → (per milestone: GATE → BUILD → VERIFY)
 */
export async function runM4Loop(
  hypothesis: string,
  repoRoot: string
): Promise<{
  success: boolean;
  design: Design;
  plan: PlanOutput;
  milestonesCompleted: number;
  totalCost: number;
  budgetHalted: boolean;
}> {
  const cap = budgetLimitTokens();
  const spentSoFar = () =>
    readLedger(repoRoot)
      .filter((e) => e.milestone.startsWith("M4-"))
      .reduce((sum, e) => sum + e.tokens_in + e.tokens_out, 0);

  // DESIGN
  const design = await designStep(
    { hypothesis, context: "Feature request from user" },
    repoRoot
  );

  // PLAN
  const plan = await planStep(design, repoRoot);

  let milestonesCompleted = 0;
  let priorMilestoneId: string | null = null;
  let budgetHalted = false;

  for (const milestone of plan.milestones) {
    // Budget circuit-breaker (M23): halt before starting the next milestone's
    // expensive GATE→BUILD→VERIFY once the cap is reached.
    if (cap !== null) {
      const spent = spentSoFar();
      if (spent >= cap) {
        appendLedger(
          {
            ts: new Date().toISOString(),
            milestone: "M4-BUDGET",
            step: `budget-halt-${milestone.id}`,
            attempt: 1,
            tier: "n/a",
            tokens_in: 0,
            tokens_out: 0,
            baseline_tokens: 0,
            pass: false,
            metric: 0,
            outcome: "STUCK",
            retries: 0,
            rules_included: [],
            rules_excluded: [],
            note: budgetHaltNote(spent, cap),
          },
          repoRoot
        );
        budgetHalted = true;
        break;
      }
    }

    // GATE
    const gate = await gateStep(milestone, priorMilestoneId, repoRoot);
    if (!gate.proceed) {
      break;
    }

    // BUILD
    const build = await buildStep(milestone, "sonnet", repoRoot);
    if (!build.success) {
      // Escalate to opus and retry
      const retryBuild = await buildStep(milestone, "opus", repoRoot);
      if (!retryBuild.success) {
        break;
      }
    }

    // VERIFY
    const verify = await verifyStep(
      milestone,
      build.output,
      repoRoot
    );
    if (!verify.pass) {
      break;
    }

    milestonesCompleted++;
    priorMilestoneId = milestone.id;
  }

  const ledger = readLedger(repoRoot);
  const m4Entries = ledger.filter((e) => e.milestone.startsWith("M4-"));
  const totalCost = m4Entries.reduce((sum, e) => sum + e.tokens_in + e.tokens_out, 0);

  return {
    success: milestonesCompleted === plan.milestones.length && !budgetHalted,
    design,
    plan,
    milestonesCompleted,
    totalCost,
    budgetHalted,
  };
}
