import * as fs from "fs";
import * as path from "path";
import { encode } from "gpt-tokenizer";
import { Capability, CapabilityAvailability, CapabilityResult, RepoEnv } from "./types";

// doc-fetch: instead of the model reading a whole dependency folder, return a
// compressed snippet of the package's README + its type surface (.d.ts head).
// Native, Node-only (needs node_modules). Context7 MCP is the user-wired
// accelerator claude0 only detects and surfaces (it can't invoke MCP itself).

const README_CHAR_CAP = 1200;
const DTS_LINE_CAP = 40;

/** Read + truncate a package's README and type surface from node_modules. */
export function fetchPackageDoc(pkg: string, repoRoot: string): string {
  const pkgDir = path.join(repoRoot, "node_modules", pkg);
  if (!fs.existsSync(pkgDir)) return "";

  const parts: string[] = [];

  // README (first heading block, capped).
  for (const name of ["README.md", "readme.md", "README", "Readme.md"]) {
    const p = path.join(pkgDir, name);
    if (fs.existsSync(p)) {
      const text = fs.readFileSync(p, "utf8").slice(0, README_CHAR_CAP);
      parts.push(`${pkg} README (truncated):\n${text}`);
      break;
    }
  }

  // Type surface: the package's declared types entry, head only.
  try {
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")
    );
    const typesRel = pkgJson.types || pkgJson.typings;
    if (typesRel) {
      const typesPath = path.join(pkgDir, typesRel);
      if (fs.existsSync(typesPath)) {
        const head = fs
          .readFileSync(typesPath, "utf8")
          .split("\n")
          .slice(0, DTS_LINE_CAP)
          .join("\n");
        parts.push(`${pkg} types (head):\n${head}`);
      }
    }
  } catch {
    // no/malformed package.json — README alone is fine
  }

  return parts.join("\n\n");
}

export const docsCapability: Capability = {
  name: "doc-fetch",
  triggerTags: [], // selected when a step names an external package

  availability(env: RepoEnv): CapabilityAvailability {
    if (!env.hasNodeModules) {
      return {
        status: "inactive",
        detail: "native (node_modules only) — inactive here",
        advisory: env.context7Configured
          ? undefined
          : "Context7 MCP not configured (optional)",
      };
    }
    return {
      status: "native",
      detail: "native (node_modules README + types)",
      advisory: env.context7Configured ? "Context7 MCP also configured" : undefined,
    };
  },

  // `input` is a package name.
  run(input: string, env: RepoEnv): CapabilityResult {
    const tokensBefore = encode(input).length;
    const output = env.hasNodeModules ? fetchPackageDoc(input.trim(), env.repoRoot) : "";
    return {
      name: "doc-fetch",
      output,
      // "before" here is conceptual: reading the whole package would cost far
      // more; we report the produced snippet's cost as the after.
      tokensBefore,
      tokensAfter: encode(output).length,
      source: "native",
    };
  },
};
