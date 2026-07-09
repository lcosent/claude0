import { z } from "zod";

export const StepOutputSchema = z.object({
  result: z.string(),
  confidence: z.number().min(0).max(1),
});

export type StepOutput = z.infer<typeof StepOutputSchema>;

export interface ValidationResult {
  valid: boolean;
  repaired: boolean;
  output?: StepOutput;
}

/** Validates raw output against the schema; on failure, attempts exactly one repair. */
export function validateWithRepair(
  raw: unknown,
  repair: (bad: unknown) => unknown
): ValidationResult {
  const first = StepOutputSchema.safeParse(raw);
  if (first.success) return { valid: true, repaired: false, output: first.data };

  const repaired = StepOutputSchema.safeParse(repair(raw));
  if (repaired.success) return { valid: true, repaired: true, output: repaired.data };

  return { valid: false, repaired: true };
}
