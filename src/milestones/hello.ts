import type { Milestone } from "../types";

export const helloMilestone: Milestone = {
  id: "hello",
  maxAttempts: 1,
  run: () => ({ pass: true, metric: 1 }),
  success: (metric) => metric === 1,
};
