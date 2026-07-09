# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | ✅ Supported       |
| < 1.0   | ❌ Not supported   |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to the project maintainer. You should receive a response within 48 hours. If the issue is confirmed, we will release a patch as soon as possible depending on complexity.

### What to Include

- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting)
- Full paths of source file(s) related to the issue
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

## Security Considerations

### Ledger Contents

The `.claude0/ledger.jsonl` file logs every operation including:
- Rule names and context
- Token counts
- Step descriptions
- File paths

**Do not commit ledger files that may contain sensitive information** (API keys in prompts, internal file paths, proprietary rule content). The default `.gitignore` excludes `ledger.jsonl`.

### Rules Directory

Rules in `.claude0/rules/*.md` may contain:
- Security policies
- API endpoints
- Internal conventions
- Proprietary practices

**Review rules before making a repo public.** Consider using:
- Generic rules for public repos
- Specific rules in private repos
- `.gitignore` for sensitive rules

### Hook Execution

The `claude0 intercept` hook (planned for v0.2) will run on every Claude Code prompt. Ensure:
- ClaudeZero binary is from trusted source
- `.claude/settings.json` hook command is not modified maliciously
- File permissions on `.claude0/` prevent unauthorized modification

### Policy Files

`.claude0/policy.yaml` controls model tier selection. A malicious policy could:
- Always route to Opus (expensive)
- Always route to Haiku (low quality)

**Review policy changes** before accepting auto-tuned updates (M5).

### Uninstall Protection

`claude0 uninstall` warns before deleting ledger data. This prevents:
- Accidental loss of logged operations
- Loss of learning data

Override with `--force` only when certain.

## Best Practices

1. **Keep claude0 updated** to latest version
2. **Review `.claude0/` contents** before committing
3. **Use `.gitignore`** for sensitive logs and rules
4. **Verify npm package** authenticity before installing
5. **Check hook configuration** in `.claude/settings.json`

## Known Issues

None currently. Check [GitHub Issues](https://github.com/lcosent/claude0/issues) for reported vulnerabilities.

## Disclosure Policy

When a security issue is confirmed:
1. Patch developed privately
2. Security advisory published
3. Patch released with version bump
4. Public disclosure after users have time to update

## Contact

For security issues, please open a [confidential security advisory](https://github.com/lcosent/claude0/security/advisories/new) on GitHub.

For general issues, use [GitHub Issues](https://github.com/lcosent/claude0/issues).

---

<div align="center">

**[⬆ back to top](#security-policy)**

</div>
