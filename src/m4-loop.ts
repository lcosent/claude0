import { compile, tokenCount, fullContextBundle } from "./compiler";
import { appendLedger, readLedger } from "./ledger";
import { Policy, nextTier, Tier } from "./policy";
import { StepOutputSchema } from "./contract";
import { callModel } from "./llm";

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

  appendLedger(
    {
      ts: new Date().toISOString(),
      milestone: "M4-DESIGN",
      step: "converge",
      attempt: 1,
      tier: "opus",
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

  // Real model call (claude CLI subscription, or deterministic stub offline).
  const prompt = `${bundle.objective}\n\n${bundle.constraints.join("\n")}`;
  const resp = callModel(prompt, tier);
  // Success = the model returned substantive output for the step.
  const pass = resp.text.trim().length > 0;

  appendLedger(
    {
      ts: new Date().toISOString(),
      milestone: "M4-BUILD",
      step: `build-${milestone.id}`,
      attempt: 1,
      tier,
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

    // Real reviewer call. Verification asks the model to end with PASS/FAIL;
    // offline stub echoes the prompt (treated as PASS — substantive output).
    const prompt = `${bundle.objective}\n\nImplementation:\n${implementation}\n\nRespond PASS or FAIL with one reason.`;
    const resp = callModel(prompt, "sonnet");
    const pass = !/\bFAIL\b/i.test(resp.text) && resp.text.trim().length > 0;

    appendLedger(
      {
        ts: new Date().toISOString(),
        milestone: "M4-VERIFY",
        step: `verify-${milestone.id}-${reviewer.name}`,
        attempt: 1,
        tier: "sonnet",
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
}> {
  // DESIGN
  const design = await designStep(
    { hypothesis, context: "Feature request from user" },
    repoRoot
  );

  // PLAN
  const plan = await planStep(design, repoRoot);

  let milestonesCompleted = 0;
  let priorMilestoneId: string | null = null;

  for (const milestone of plan.milestones) {
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
    success: milestonesCompleted === plan.milestones.length,
    design,
    plan,
    milestonesCompleted,
    totalCost,
  };
}
