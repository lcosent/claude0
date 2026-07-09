<div align="center">

# Contributing to ClaudeZero

Thank you for your interest in making claude0 better.

**[Report Bug](https://github.com/lcosent/claude0/issues)** · **[Request Feature](https://github.com/lcosent/claude0/issues)** · **[Discussions](https://github.com/lcosent/claude0/discussions)**

</div>

---

## Code of Conduct

Be respectful, constructive, and professional in all interactions.

## How to Contribute

### Reporting Bugs

Before creating a bug report:
- Check existing issues to avoid duplicates
- Collect information about your environment (OS, Node version, Claude Code version)

Create an issue with:
- **Clear title** describing the bug
- **Steps to reproduce** with minimal example
- **Expected behavior** vs **actual behavior**
- **Environment details** (OS, versions)
- **Relevant logs** from `.claude0/ledger.jsonl` if applicable

### Suggesting Features

Feature requests should include:
- **Use case:** What problem does this solve?
- **Proposed solution:** How would it work?
- **Alternatives considered:** What other approaches did you think about?
- **Impact:** How does this fit the project's goals?

### Pull Requests

1. **Fork the repository** and create a branch from `main`
2. **Make your changes** following the coding standards below
3. **Add tests** for new functionality (see Testing section)
4. **Update documentation** (README, MILESTONES, etc.)
5. **Run the test suite:** `npm test`
6. **Commit with clear messages** following conventional commits format
7. **Open a pull request** with description of changes

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/claude0.git
cd claude0

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Test specific milestone
npm run test:m1

# Link for local development
npm link
```

## Coding Standards

### TypeScript
- **Strict mode enabled** — no `any` unless absolutely necessary
- **Named exports** over default exports
- **Interface over type** for object shapes
- **Clear function names** that describe what, not how

### Style
- **No comments** unless explaining non-obvious why
- **No premature abstraction** — three similar lines beat a speculative helper
- **Prefer editing existing files** over creating new ones
- **Keep functions focused** — one responsibility per function

### Commits
Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: Add cross-repo policy sync
fix: Compiler silent-drop on empty rules dir
docs: Update README installation instructions
test: Add M4 escalation test case
refactor: Extract tier selection to separate function
```

## Testing

### Test Structure
- Each milestone has a test file: `src/m1-test.ts`, `src/m2-test.ts`, etc.
- Tests use the existing `.claude0/` fixtures in the repo
- Tests must be deterministic and self-contained

### Writing Tests
```typescript
// Test should validate success criteria from MILESTONES.md
function main() {
  const repoRoot = process.cwd();
  
  // Execute the milestone functionality
  const result = await testFunction(repoRoot);
  
  // Check success criteria
  const criterion1Pass = result.metric >= threshold;
  const criterion2Pass = result.data.length > 0;
  
  // Log results
  console.log(`GATE criterion-1: ${criterion1Pass ? "PASS" : "FAIL"}`);
  console.log(`GATE criterion-2: ${criterion2Pass ? "PASS" : "FAIL"}`);
  
  // Exit with status
  process.exit(criterion1Pass && criterion2Pass ? 0 : 1);
}
```

### Running Tests
```bash
npm test              # All milestones
npm run test:m1       # Specific milestone
npm run test:m0       # Autonomy claude0
```

## Project Structure

```
claude0/
├─ src/
│  ├─ cli.ts          # CLI entrypoint
│  ├─ compiler.ts     # M1: Context compiler
│  ├─ policy.ts       # M2: Tier routing
│  ├─ contract.ts     # M3: Schema validation
│  ├─ m4-loop.ts      # M4: Full orchestration loop
│  ├─ ledger.ts       # Append-only JSONL log
│  ├─ report.ts       # M6: Token dashboard
│  ├─ paths.ts        # Path resolution
│  └─ *-test.ts       # Milestone tests
├─ .claude0/
│  ├─ rules/          # Sample rules
│  └─ policy.yaml     # Default policy
├─ DESIGN.md          # Architecture decisions
├─ MILESTONES.md      # Success criteria
└─ README.md          # User documentation
```

## Milestone Development

If adding a new milestone (M8+):

1. **Document in MILESTONES.md:**
   - Goal, hypothesis, build steps
   - Test command
   - Success criteria (numeric, binary)
   - Gate to next milestone

2. **Implement in `src/`:**
   - New file or extend existing
   - Follow compiler → ledger pattern
   - Log all operations with `tokens_in`, `baseline_tokens`

3. **Create test `src/m8-test.ts`:**
   - Must validate all success criteria
   - Exit 0 on pass, 1 on fail
   - Log GATE results

4. **Update package.json:**
   - Add `test:m8` script
   - Add to `npm test` chain

5. **Update documentation:**
   - README: Add milestone to status
   - IMPLEMENTATION.md: Add deliverables

## Documentation

### When to Update Docs

- **readme.md:** User-facing changes (new commands, usage patterns)
- **contributing.md:** Development process changes

### Documentation Style

- **Active voice** — "Compile context" not "Context is compiled"
- **Code examples** for all features
- **Clear success/failure cases**
- **No marketing speak** — technical, precise

## Ledger Schema

When adding new ledger fields, maintain backward compatibility:

```typescript
// Good: Optional new field
export const LedgerEntry = z.object({
  // ... existing fields
  new_field: z.string().optional(),  // Won't break existing ledgers
});

// Bad: Required new field
export const LedgerEntry = z.object({
  // ... existing fields
  new_field: z.string(),  // Breaks existing ledgers!
});
```

## Release Process

1. **Version bump** in `package.json`
2. **Update changelog.md** with changes since last release
3. **Run full test suite:** `npm test`
4. **Build:** `npm run build`
5. **Tag release:** `git tag v0.2.0`
6. **Push:** `git push origin main --tags`
7. **Create GitHub release** with changelog

---

<div align="center">

## Questions?

**[Open an Issue](https://github.com/lcosent/claude0/issues)** · **[Start a Discussion](https://github.com/lcosent/claude0/discussions)** · **[Security Policy](security.md)**

<br/>

### Thank you for contributing! 

By contributing, you agree that your contributions will be licensed under the MIT License.

**[⬆ back to top](#contributing-to-claude0)**

</div>
