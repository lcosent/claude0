import * as fs from "fs";
import * as path from "path";
import { encode } from "gpt-tokenizer";
import { requireClaudeZeroRoot, rulesDir } from "./paths";

export interface Rule {
  file: string;
  tags: string[];
  body: string;
}

export interface Bundle {
  objective: string;
  constraints: string[]; // rule bodies included
  rules_included: string[];
  rules_excluded: string[];
}

export function loadRules(repoRoot?: string): Rule[] {
  const root = repoRoot ?? requireClaudeZeroRoot();
  const rulesDirectory = rulesDir(root);

  if (!fs.existsSync(rulesDirectory)) {
    return [];
  }

  return fs
    .readdirSync(rulesDirectory)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(rulesDirectory, f), "utf8");
      const match = raw.match(/^---\r?\ntags:\s*\[([^\]]*)\]\r?\n---\r?\n([\s\S]*)$/);
      if (!match) throw new Error(`malformed rule frontmatter: ${f}`);
      const tags = match[1].split(",").map((t) => t.trim());
      const body = match[2].trim();
      return { file: f, tags, body };
    });
}

/** goal.requiredTags = tags a step MUST retain; dropping one of these is a silent-drop failure. */
export function compile(
  objective: string,
  stepTags: string[],
  requiredTags: string[] = stepTags,
  repoRoot?: string
): Bundle {
  const rules = loadRules(repoRoot);
  const included = rules.filter((r) => r.tags.some((t) => stepTags.includes(t)));
  const excluded = rules.filter((r) => !included.includes(r));

  const includedRequired = new Set(
    included.filter((r) => r.tags.some((t) => requiredTags.includes(t))).map((r) => r.file)
  );
  for (const req of requiredTags) {
    const hasMatch = rules.some((r) => r.tags.includes(req));
    if (hasMatch && !rules.some((r) => r.tags.includes(req) && included.includes(r))) {
      throw new Error(`silent-drop: required tag "${req}" matched no included rule`);
    }
  }

  return {
    objective,
    constraints: included.map((r) => r.body),
    rules_included: included.map((r) => r.file),
    rules_excluded: excluded.map((r) => r.file),
  };
}

export function fullContextBundle(objective: string, repoRoot?: string): Bundle {
  const rules = loadRules(repoRoot);
  return {
    objective,
    constraints: rules.map((r) => r.body),
    rules_included: rules.map((r) => r.file),
    rules_excluded: [],
  };
}

export function tokenCount(bundle: Bundle): number {
  const text = bundle.objective + "\n" + bundle.constraints.join("\n");
  return encode(text).length;
}
