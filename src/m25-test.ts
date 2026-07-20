import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { splitSections, migrateContent, slugify, renderRuleFile } from "./migrate";
import { stashOutput, recallOutput, outputId } from "./output-store";
import { loadRules, compile } from "./compiler";
import { runIntercept } from "./intercept";

// M25 — the two honesty/reversibility fixes:
//   1. Tool-output compression is reversible (stash + recall).
//   2. `init` migrates a real CLAUDE.md so savings are measured against the
//      user's own rules, and untaggable sections are never silently dropped.

function main() {
  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
    ok ? pass++ : fail++;
  };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude0-m25-"));
  fs.mkdirSync(path.join(tmp, ".claude0", "rules"), { recursive: true });

  // ---- Fix #1: reversible tool-output compression --------------------------

  const original = Array.from({ length: 300 }, (_, i) => `line ${i} of noisy output`).join("\n");
  const id = stashOutput(original, tmp);
  check("recall: roundtrips the exact original", recallOutput(id, tmp) === original);
  check("recall: id is deterministic (same content → same id)", outputId(original) === id);
  check("recall: unknown id returns null", recallOutput("deadbeef00", tmp) === null);
  check(
    "recall: rejects path-traversal ids (no escape from outputs/)",
    recallOutput("../../etc/passwd", tmp) === null
  );

  // ---- Fix #2a: migration splits and tags CLAUDE.md ------------------------

  const claudeMd = [
    "# Project Overview",
    "This service handles billing. Keep it reliable.",
    "",
    "## Testing",
    "Write tests for every new endpoint. Prefer integration tests.",
    "",
    "## Security",
    "Sanitize all user input and check authorization on every handler.",
  ].join("\n");

  const sections = splitSections(claudeMd);
  check("migrate: splits on headings", sections.length === 3, `${sections.length} sections`);

  const rules = migrateContent(claudeMd);
  const testingRule = rules.find((r) => r.tags.includes("testing"));
  const securityRule = rules.find((r) => r.tags.includes("security"));
  const alwaysRule = rules.find((r) => r.tags.includes("always"));
  check("migrate: Testing section tagged 'testing'", !!testingRule);
  check("migrate: Security section tagged 'security'", !!securityRule);
  check(
    "migrate: untaggable Overview falls back to 'always' (never dropped)",
    !!alwaysRule && alwaysRule.body.includes("billing")
  );
  check("migrate: file names are unique", new Set(rules.map((r) => r.file)).size === rules.length);
  check("slugify: empty heading gets a stable fallback", slugify("", 4) === "section-5");

  // Written rules parse back through the compiler's frontmatter reader.
  for (const r of rules) {
    fs.writeFileSync(path.join(tmp, ".claude0", "rules", r.file), renderRuleFile(r));
  }
  const loaded = loadRules(tmp); // must not throw on our generated frontmatter
  check("migrate: rendered rules parse via loadRules", loaded.length === rules.length);

  // ---- Fix #2b: always-rules are injected regardless of the prompt ---------

  const irrelevant = runIntercept({ prompt: "what time is it", cwd: tmp }, tmp);
  check(
    "intercept: 'always' rule injected even when no keyword matches",
    irrelevant.additionalContext.includes("billing"),
    `ctx len=${irrelevant.additionalContext.length}`
  );
  check(
    "intercept: keyword prompt still narrows (testing not in an unrelated prompt's excludes)",
    runIntercept({ prompt: "add a security check to auth", cwd: tmp }, tmp).rules_included.some(
      (f) => f === securityRule!.file
    )
  );

  // Baseline is now the user's real rule set, not claude0's invention: a
  // security prompt must exclude the testing rule (real, provable savings).
  const secBundle = compile("auth security", ["security", "always"], ["security"], tmp);
  check(
    "compile: security prompt excludes the testing rule (genuine selection)",
    secBundle.rules_excluded.includes(testingRule!.file)
  );

  fs.rmSync(tmp, { recursive: true, force: true });

  console.log("---");
  console.log(`M25 RESULT: ${fail === 0 ? "PASS" : "FAIL"}  (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
