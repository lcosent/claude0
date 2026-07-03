import { runMilestone } from "./loop";
import { helloMilestone } from "./milestones/hello";
import { alwaysFailMilestone } from "./milestones/always-fail";

const REGISTRY = {
  hello: helloMilestone,
  "always-fail": alwaysFailMilestone,
};

async function main() {
  const id = process.argv[2];
  const m = (REGISTRY as Record<string, typeof helloMilestone>)[id];
  if (!m) {
    console.error(`unknown milestone: ${id}`);
    process.exit(1);
  }
  const outcome = await runMilestone(m);
  console.log(`outcome=${outcome}`);
  process.exit(outcome === "PASS" ? 0 : 1);
}

main();
