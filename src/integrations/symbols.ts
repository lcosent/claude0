import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { encode } from "gpt-tokenizer";
import { Capability, CapabilityAvailability, CapabilityResult, RepoEnv } from "./types";

// symbol-query: answer "type of X / does this file compile?" via the TS
// Language Service instead of dumping the whole file into context. Native
// because `typescript` is already a dependency — zero new deps.
//
// Portability (eng-review Issue 1): needs a tsconfig. In a non-TS repo it
// reports "inactive here" rather than erroring or silently no-op'ing.

export interface SymbolQuery {
  file: string;
  symbol?: string;
  line?: number;
}

export interface SymbolAnswer {
  found: boolean;
  kind: "type" | "diagnostics" | "unavailable";
  type?: string;
  diagnostics?: string[];
}

// Cached per process (reuse scope = within one intercept/loop run, not across
// CLI calls — a fresh CLI process rebuilds it, which is the intended scope).
let cachedService: { root: string; service: ts.LanguageService } | null = null;

function getLanguageService(repoRoot: string): ts.LanguageService | null {
  if (cachedService && cachedService.root === repoRoot) return cachedService.service;

  const configPath = path.join(repoRoot, "tsconfig.json");
  if (!fs.existsSync(configPath)) return null;

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config ?? {},
    ts.sys,
    repoRoot
  );

  const files = new Map<string, number>(); // path -> version
  parsed.fileNames.forEach((f) => files.set(f, 0));

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => Array.from(files.keys()),
    getScriptVersion: (f) => String(files.get(f) ?? 0),
    getScriptSnapshot: (f) => {
      if (!fs.existsSync(f)) return undefined;
      return ts.ScriptSnapshot.fromString(fs.readFileSync(f, "utf8"));
    },
    getCurrentDirectory: () => repoRoot,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  cachedService = { root: repoRoot, service };
  return service;
}

/** Test seam. */
export function clearSymbolCache(): void {
  cachedService = null;
}

/**
 * Query a symbol's type, or a file's diagnostics. Returns an answer object;
 * never reads the whole file into the model's context.
 */
export function querySymbol(q: SymbolQuery, repoRoot: string): SymbolAnswer {
  const service = getLanguageService(repoRoot);
  if (!service) return { found: false, kind: "unavailable" };

  const abs = path.isAbsolute(q.file) ? q.file : path.join(repoRoot, q.file);
  if (!fs.existsSync(abs)) return { found: false, kind: "unavailable" };

  // If a symbol name is given, find its first occurrence and report its type.
  if (q.symbol) {
    const text = fs.readFileSync(abs, "utf8");
    const idx = text.indexOf(q.symbol);
    if (idx >= 0) {
      const info = service.getQuickInfoAtPosition(abs, idx);
      if (info) {
        return {
          found: true,
          kind: "type",
          type: ts.displayPartsToString(info.displayParts),
        };
      }
    }
    return { found: false, kind: "type" };
  }

  // Otherwise report compile diagnostics for the file.
  const diags = [
    ...service.getSyntacticDiagnostics(abs),
    ...service.getSemanticDiagnostics(abs),
  ];
  return {
    found: true,
    kind: "diagnostics",
    diagnostics: diags.map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, "\n")
    ),
  };
}

export const symbolCapability: Capability = {
  name: "symbol-query",
  triggerTags: ["typescript", "implementation", "review"],

  availability(env: RepoEnv): CapabilityAvailability {
    if (!env.hasTsconfig) {
      return {
        status: "inactive",
        detail: "native (TS repos only) — inactive here",
        advisory: env.lspMcpConfigured
          ? undefined
          : "LSP-MCP not configured (optional, for non-TS repos)",
      };
    }
    return {
      status: "native",
      detail: "native (TS Language Service)",
      advisory: env.lspMcpConfigured ? "LSP-MCP also configured" : undefined,
    };
  },

  // `input` is a JSON-encoded SymbolQuery; output is a compact answer string.
  run(input: string, env: RepoEnv): CapabilityResult {
    const tokensBefore = encode(input).length;
    let output: string;
    if (!env.hasTsconfig) {
      output = ""; // inactive in non-TS repos — inject nothing
    } else {
      let q: SymbolQuery;
      try {
        q = JSON.parse(input);
      } catch {
        q = { file: input };
      }
      const answer = querySymbol(q, env.repoRoot);
      output =
        answer.kind === "type" && answer.found
          ? `${q.symbol}: ${answer.type}`
          : answer.kind === "diagnostics"
          ? (answer.diagnostics && answer.diagnostics.length
              ? `diagnostics: ${answer.diagnostics.join("; ")}`
              : "diagnostics: none (compiles clean)")
          : "";
    }
    return {
      name: "symbol-query",
      output,
      tokensBefore,
      tokensAfter: encode(output).length,
      source: "native",
    };
  },
};
