import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { detectRepoEnv, clearDetectCache } from "./integrations";

// M18 — optional gstack integration (orchestration leaves). gstack is an
// orchestration layer claude0 DETECTS but never invokes. The guarantee is
// honest degradation: present → surfaced; absent → surfaced as absent; never a
// hard dependency, never a throw. Detection is driven by the real filesystem
// ($GSTACK_HOME override or ~/.claude/skills/gstack).

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  cond ? pass++ : fail++;
}

const repo = fs.mkdtempSync(path.join(os.tmpdir(), "claude0-m18-repo-"));
fs.mkdirSync(path.join(repo, ".claude0"), { recursive: true });

const savedGstackHome = process.env.GSTACK_HOME;
const savedHome = process.env.HOME;

// Isolate HOME so the developer's real ~/.claude/skills/gstack can't leak in
// and make the "absent" case flaky.
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "claude0-m18-home-"));
process.env.HOME = fakeHome;

// 1. gstack ABSENT (no GSTACK_HOME, empty HOME) → detected false, no throw.
delete process.env.GSTACK_HOME;
clearDetectCache();
let absentOk = true;
let envAbsent;
try {
  envAbsent = detectRepoEnv(repo);
} catch {
  absentOk = false;
}
check("absent gstack never throws", absentOk);
check("absent gstack → gstackInstalled false", envAbsent?.gstackInstalled === false);

// 2. gstack PRESENT via $GSTACK_HOME → detected true.
const gstackDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude0-m18-gstack-"));
process.env.GSTACK_HOME = gstackDir;
clearDetectCache();
const envPresent = detectRepoEnv(repo);
check("present gstack (GSTACK_HOME) → gstackInstalled true", envPresent.gstackInstalled === true);

// 3. $GSTACK_HOME pointing at a NON-existent path → still false, no throw.
process.env.GSTACK_HOME = path.join(gstackDir, "does-not-exist");
clearDetectCache();
const envBadPath = detectRepoEnv(repo);
check("GSTACK_HOME → missing dir → false", envBadPath.gstackInstalled === false);

// 4. Conventional path: ~/.claude/skills/gstack under our fake HOME.
delete process.env.GSTACK_HOME;
fs.mkdirSync(path.join(fakeHome, ".claude", "skills", "gstack"), { recursive: true });
clearDetectCache();
const envConventional = detectRepoEnv(repo);
check("conventional ~/.claude/skills/gstack → true", envConventional.gstackInstalled === true);

// restore env
if (savedGstackHome === undefined) delete process.env.GSTACK_HOME;
else process.env.GSTACK_HOME = savedGstackHome;
process.env.HOME = savedHome;
clearDetectCache();

for (const d of [repo, gstackDir, fakeHome]) fs.rmSync(d, { recursive: true, force: true });

console.log(`\nM18 RESULT: ${fail === 0 ? "PASS" : "FAIL"}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
