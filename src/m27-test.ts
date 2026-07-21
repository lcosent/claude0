import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { makeSandbox } from "./test-sandbox";
import { encode } from "gpt-tokenizer";

// M27 — end-to-end gates against the REAL CLI binary.
//
// Every prior milestone calls exported functions directly, so the entire
// argv/dispatch layer and the stdin hook wrappers were untested — which is
// exactly where the fail-open guarantee lives. These gates spawn dist/cli.js
// the way Claude Code does.

const CLI = path.join(__dirname, "..", "dist", "cli.js");

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

// Never let a spawned CLI resolve THIS repo as its claude0 root: a hook payload
// without an explicit cwd falls back to process.cwd(), which would append test
// rows to the developer's real ledger. Default every run into a scratch dir.
const NEUTRAL_CWD = fs.mkdtempSync(path.join(require("os").tmpdir(), "claude0-m27-neutral-"));

function runCli(args: string[], opts: { stdin?: string; cwd?: string } = {}): Run {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      input: opts.stdin ?? "",
      cwd: opts.cwd ?? NEUTRAL_CWD,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (e: any) {
    return {
      status: typeof e.status === "number" ? e.status : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

function main() {
  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
    ok ? pass++ : fail++;
  };

  if (!fs.existsSync(CLI)) {
    console.log("FAIL  dist/cli.js missing — run `npm run build` first");
    process.exit(1);
  }

  // ---- Hooks fail OPEN -----------------------------------------------------
  // These payloads all used to produce an unhandled rejection: stack trace on
  // stderr and exit 1, inside the user's live Claude Code session.

  const hostile = [
    ["null", "JSON null"],
    ["[1,2,3]", "JSON array"],
    ["42", "JSON number"],
    ["not json at all", "non-JSON text"],
    ['{"tool_response":', "truncated JSON"],
    ["", "empty stdin"],
    ['{"tool_name":"Bash","tool_response":{"stdout":null}}', "null stdout"],
  ];
  for (const [payload, label] of hostile) {
    for (const cmd of ["intercept", "compress-output"]) {
      const r = runCli([cmd], { stdin: payload });
      check(
        `fail-open: ${cmd} exits 0 on ${label}`,
        r.status === 0,
        `exit=${r.status}${r.stderr ? " stderr=" + r.stderr.split("\n")[0].slice(0, 60) : ""}`
      );
    }
  }

  // ---- Compression never makes things worse --------------------------------

  const sandbox = makeSandbox("m27-compress");

  // Tiny output: the recall banner alone costs ~39 tokens, so this used to be
  // rewritten from 3 tokens to ~42.
  const tiny = runCli(["compress-output"], {
    stdin: JSON.stringify({
      tool_name: "Bash",
      cwd: sandbox,
      tool_response: { stdout: "ok\n\n\ndone" },
    }),
  });
  check("floor: tiny output is passed through untouched", tiny.stdout.trim() === "", `stdout=${tiny.stdout.slice(0, 40)}`);

  // Salience-dense output: nearly every line is an error, so elision markers
  // cost more than the lines they replace. Measured 599 -> 999 tokens before.
  const dense = Array.from({ length: 200 }, (_, i) =>
    i % 2 === 0 ? `ERROR: failure at module ${i} assertion failed` : "x"
  ).join("\n");
  const denseRun = runCli(["compress-output"], {
    stdin: JSON.stringify({ tool_name: "Bash", cwd: sandbox, tool_response: { stdout: dense } }),
  });
  let denseEmitted = encode(dense).length;
  if (denseRun.stdout.trim()) {
    denseEmitted = encode(
      JSON.parse(denseRun.stdout).hookSpecificOutput.updatedToolOutput.stdout
    ).length;
  }
  check(
    "net-benefit: salience-dense output never expands",
    denseEmitted <= encode(dense).length,
    `${encode(dense).length} -> ${denseEmitted}`
  );

  // Genuinely compressible output must still compress, banner and all.
  const noisy = [
    ...Array(80).fill("Downloading dependency metadata..."),
    ...Array.from({ length: 60 }, (_, i) => `[====>   ] ${i}% eta 0:03`),
    ...Array.from({ length: 80 }, (_, i) => `added package-${i}@1.0.0 to node_modules`),
    "found 0 vulnerabilities",
  ].join("\n");
  const noisyRun = runCli(["compress-output"], {
    stdin: JSON.stringify({ tool_name: "Bash", cwd: sandbox, tool_response: { stdout: noisy } }),
  });
  const emittedStdout = noisyRun.stdout.trim()
    ? JSON.parse(noisyRun.stdout).hookSpecificOutput.updatedToolOutput.stdout
    : "";
  check(
    "net-benefit: noisy output still compresses",
    emittedStdout !== "" && encode(emittedStdout).length < encode(noisy).length,
    `${encode(noisy).length} -> ${encode(emittedStdout).length}`
  );
  check("reversibility: emitted view carries a recall handle", /claude0 recall [a-f0-9]+/.test(emittedStdout));

  // The ledger must report the EMITTED size, banner included — not the
  // pre-banner number, which overstated savings by ~39 tokens every time.
  const ledgerLines = fs
    .readFileSync(path.join(sandbox, ".claude0", "ledger.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
  const emitRow = ledgerLines.find((r) => String(r.note).startsWith("compress "));
  check(
    "honest metrics: ledger tokens_in equals the emitted token count",
    !!emitRow && emitRow.tokens_in === encode(emittedStdout).length,
    emitRow ? `ledger=${emitRow.tokens_in} actual=${encode(emittedStdout).length}` : "no row"
  );
  check(
    "honest metrics: a declined compression is logged as skipped",
    ledgerLines.some((r) => String(r.note).startsWith("skipped: no net benefit"))
  );

  // ---- init preserves the user's own hooks ---------------------------------

  const repo = fs.mkdtempSync(path.join(require("os").tmpdir(), "claude0-m27-init-"));
  fs.mkdirSync(path.join(repo, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, ".claude", "settings.json"),
    JSON.stringify({
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: "command", command: "my-own-logger" }] }],
        PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "my-prettier" }] }],
      },
      permissions: { allow: ["Bash(ls:*)"] },
    })
  );
  fs.writeFileSync(path.join(repo, "CLAUDE.md"), "# Rules\n\n## Testing\nWrite tests.\n");
  runCli(["init"], { cwd: repo });

  const settings = JSON.parse(fs.readFileSync(path.join(repo, ".claude", "settings.json"), "utf8"));
  const allCommands = Object.values(settings.hooks as Record<string, any[]>)
    .flat()
    .flatMap((g: any) => g.hooks.map((h: any) => h.command));
  check(
    "init: preserves pre-existing user hooks",
    allCommands.includes("my-own-logger") && allCommands.includes("my-prettier"),
    `[${allCommands.join(", ")}]`
  );
  check(
    "init: still registers both claude0 hooks",
    allCommands.includes("claude0 intercept") && allCommands.includes("claude0 compress-output")
  );
  check("init: backs up the original settings.json", fs.existsSync(path.join(repo, ".claude0", "settings.json.backup")));

  // Raw tool output can contain secrets; it must not be committable by default.
  const gitignore = fs.existsSync(path.join(repo, ".gitignore"))
    ? fs.readFileSync(path.join(repo, ".gitignore"), "utf8")
    : "";
  check(
    "init: gitignores the raw-output store",
    gitignore.includes(".claude0/outputs/"),
    gitignore.trim().split("\n").pop() ?? "(no .gitignore)"
  );

  // ---- uninstall never loses the user's rules ------------------------------

  const original = fs.readFileSync(path.join(repo, ".claude0", "CLAUDE.md.backup"), "utf8");
  const restored = runCli(["uninstall", "--force"], { cwd: repo });
  check("uninstall: exits 0", restored.status === 0, restored.stderr.slice(0, 60));
  check(
    "uninstall: restores the original CLAUDE.md byte-for-byte",
    fs.readFileSync(path.join(repo, "CLAUDE.md"), "utf8") === original
  );

  // The dangerous path: backup deleted, so the only copy of the user's rules is
  // .claude0/rules/ — which uninstall is about to delete. It must not vanish.
  const repo2 = fs.mkdtempSync(path.join(require("os").tmpdir(), "claude0-m27-norestore-"));
  fs.writeFileSync(path.join(repo2, "CLAUDE.md"), "# Rules\n\n## Security\nNever log secrets.\n");
  runCli(["init"], { cwd: repo2 });
  fs.rmSync(path.join(repo2, ".claude0", "CLAUDE.md.backup"));
  runCli(["uninstall", "--force"], { cwd: repo2 });
  const after2 = fs.existsSync(path.join(repo2, "CLAUDE.md"))
    ? fs.readFileSync(path.join(repo2, "CLAUDE.md"), "utf8")
    : "";
  check(
    "uninstall: rebuilds CLAUDE.md from rules when the backup is gone",
    after2.includes("Never log secrets"),
    after2 ? `${after2.length} bytes` : "FILE LOST"
  );

  // ---- init repairs a damaged install instead of refusing -----------------

  const repo3 = fs.mkdtempSync(path.join(require("os").tmpdir(), "claude0-m27-repair-"));
  fs.writeFileSync(path.join(repo3, "CLAUDE.md"), "# Rules\n\n## Testing\nWrite tests.\n");
  runCli(["init"], { cwd: repo3 });

  // Damage it the way a crashed init or a stray `rm` would, and edit a rule so
  // we can prove repair doesn't clobber user content.
  fs.rmSync(path.join(repo3, ".claude0", "policy.yaml"));
  fs.rmSync(path.join(repo3, ".claude0", "ledger.jsonl"));
  const ruleFile = fs.readdirSync(path.join(repo3, ".claude0", "rules"))[0];
  fs.appendFileSync(path.join(repo3, ".claude0", "rules", ruleFile), "\nMY EDIT\n");

  const repair = runCli(["init"], { cwd: repo3 });
  check(
    "init: repairs a damaged install rather than exiting",
    fs.existsSync(path.join(repo3, ".claude0", "policy.yaml")) &&
      fs.existsSync(path.join(repo3, ".claude0", "ledger.jsonl")),
    repair.stdout.split("\n")[0]
  );
  check(
    "init: repair preserves edited rules",
    fs.readFileSync(path.join(repo3, ".claude0", "rules", ruleFile), "utf8").includes("MY EDIT")
  );
  const repeat = runCli(["init"], { cwd: repo3 });
  check("init: repair is idempotent", repeat.stdout.includes("nothing to repair"));

  // A nested install silently shadows the parent for every hook below it.
  const nested = path.join(repo3, "packages", "inner");
  fs.mkdirSync(nested, { recursive: true });
  const nestedRun = runCli(["init"], { cwd: nested });
  check(
    "init: refuses to nest inside an existing claude0 project",
    nestedRun.status === 1 && !fs.existsSync(path.join(nested, ".claude0")),
    nestedRun.stderr.split("\n")[0]
  );

  // ---- --global is rejected where it was silently ignored ------------------

  for (const cmd of ["status", "doctor", "compile"]) {
    const r = runCli([cmd, "--global"], { cwd: repo3 });
    check(
      `--global: '${cmd}' rejects it explicitly instead of using global state`,
      r.status === 1 && r.stderr.includes("does not support --global"),
      `exit=${r.status}`
    );
  }

  console.log("---");
  console.log(`M27 RESULT: ${fail === 0 ? "PASS" : "FAIL"}  (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
