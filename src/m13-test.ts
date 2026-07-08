import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  parsePolicy,
  serializePolicy,
  pushPolicy,
  pullPolicy,
  PolicyMap,
} from "./policy-sync";
import { readLedger } from "./ledger";

// M13 — cross-project policy sync. push local→central; pull central→local with
// per-repo overrides preserved; provenance logged. Isolated via a temp central
// store (ZIPLINE_POLICY_REMOTE) and temp repos — never touches the real global.

function makeRepo(policy?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude0-m13-"));
  fs.mkdirSync(path.join(dir, ".claude0"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude0", "ledger.jsonl"), "");
  if (policy !== undefined) {
    fs.writeFileSync(path.join(dir, ".claude0", "policy.yaml"), policy);
  }
  return dir;
}

function localPolicy(repo: string): PolicyMap {
  return parsePolicy(fs.readFileSync(path.join(repo, ".claude0", "policy.yaml"), "utf8"));
}

function main() {
  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
    ok ? pass++ : fail++;
  };

  // Isolated central store.
  const central = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "claude0-central-")), "policy.yaml");
  process.env.ZIPLINE_POLICY_REMOTE = central;

  // 0. Parse/serialize round-trips.
  const sample = "# hdr\ncontext-compile: haiku\nreview: sonnet\n";
  check("parse+serialize round-trip", parsePolicy(serializePolicy(parsePolicy(sample)))["review"] === "sonnet");
  check("parse ignores comments/blanks", Object.keys(parsePolicy(sample)).length === 2);

  // 1. Repo A pushes its tuned policy to the (empty) central store.
  const repoA = makeRepo("context-compile: haiku\nreview: opus\ndesign-synthesis: opus\n");
  const pushRes = pushPolicy(repoA);
  const centralAfter = parsePolicy(fs.readFileSync(central, "utf8"));
  check("push: central gains repo A's steps", centralAfter["review"] === "opus" && centralAfter["design-synthesis"] === "opus", `${Object.keys(centralAfter).length} steps`);
  check("push: provenance logged to ledger", readLedger(repoA).some((e) => e.milestone === "policy-sync" && e.step === "push"));

  // 2. Repo B (fresh, with its OWN override) pulls — central defaults arrive,
  //    but B's override for `review` survives (repo wins).
  const repoB = makeRepo("review: haiku\n"); // B insists review=haiku
  pullPolicy(repoB);
  const bAfter = localPolicy(repoB);
  check("pull: central defaults arrive in repo B", bAfter["design-synthesis"] === "opus");
  check("pull: repo B's override survives (review stays haiku, not opus)", bAfter["review"] === "haiku", `review=${bAfter["review"]}`);
  check("pull: provenance logged", readLedger(repoB).some((e) => e.milestone === "policy-sync" && e.step === "pull"));

  // 3. Round-trip: what A pushed, a fresh repo C pulls verbatim.
  const repoC = makeRepo(); // no local policy
  pullPolicy(repoC);
  const cAfter = localPolicy(repoC);
  check("round-trip: repo C pulls A's pushed policy", cAfter["review"] === "opus" && cAfter["context-compile"] === "haiku");

  // cleanup
  for (const d of [repoA, repoB, repoC]) fs.rmSync(d, { recursive: true, force: true });
  fs.rmSync(path.dirname(central), { recursive: true, force: true });
  delete process.env.ZIPLINE_POLICY_REMOTE;

  console.log("---");
  console.log(`M13 RESULT: ${fail === 0 ? "PASS" : "FAIL"}  (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
