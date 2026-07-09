import type { Milestone } from "../types";

export const alwaysFailMilestone: Milestone = {
  id: "always-fail",
  maxAttempts: 5,
  run: () => ({ pass: false, metric: 0 }),
  success: (metric) => metric === 1,
};
