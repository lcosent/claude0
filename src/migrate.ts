import { matchTags, ALWAYS_TAG } from "./intercept";

// Turns an existing CLAUDE.md into tagged rule files. This is what makes the
// intercept baseline honest: after migration, .claude0/rules/ holds the user's
// real instructions (which they'd otherwise pay for on every prompt), so
// "savings vs full context" is measured against real, not claude0-invented, text.

export interface MigratedRule {
  file: string;
  tags: string[];
  body: string;
}

export interface Section {
  heading: string;
  body: string;
}

/**
 * Splits markdown into sections at level 1–3 headings. Content before the first
 * heading becomes a leading section with an empty heading. Empty sections drop.
 */
export function splitSections(md: string): Section[] {
  const sections: Section[] = [];
  let heading = "";
  let body: string[] = [];
  const flush = () => {
    const text = body.join("\n").trim();
    if (heading || text) sections.push({ heading, body: text });
  };
  for (const line of md.split("\n")) {
    const h = line.match(/^#{1,3}\s+(.*)$/);
    if (h) {
      flush();
      heading = h[1].trim();
      body = [];
    } else {
      body.push(line);
    }
  }
  flush();
  return sections.filter((s) => s.body.length > 0);
}

/** A filesystem-safe, readable slug for a rule file name. */
export function slugify(heading: string, index: number): string {
  const slug = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || `section-${index + 1}`;
}

/**
 * Converts CLAUDE.md text into rules. Each section is tagged by keyword match;
 * a section that matches no keyword gets the `always` tag so it is injected on
 * every prompt rather than lost. File names are de-duplicated.
 */
export function migrateContent(md: string): MigratedRule[] {
  const seen = new Set<string>();
  return splitSections(md).map((sec, i) => {
    let tags = matchTags(`${sec.heading}\n${sec.body}`);
    if (tags.length === 0) tags = [ALWAYS_TAG];

    const slug = slugify(sec.heading, i);
    let file = `${slug}.md`;
    for (let n = 2; seen.has(file); n++) file = `${slug}-${n}.md`;
    seen.add(file);

    const body = sec.heading ? `## ${sec.heading}\n${sec.body}` : sec.body;
    return { file, tags, body: body.trim() };
  });
}

/** Serializes a rule to the frontmatter format loadRules() expects. */
export function renderRuleFile(rule: MigratedRule): string {
  return `---\ntags: [${rule.tags.join(", ")}]\n---\n${rule.body}\n`;
}
