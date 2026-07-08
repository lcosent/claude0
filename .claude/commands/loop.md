---
description: Autonomously execute the backlog milestone-by-milestone — pick next, build, verify, ship, repeat. No human gate between milestones.
argument-hint: "[count | milestone-id | 'until <condition>']  (default: 1)"
---

# /loop — autonomous milestone executor

You are running the claude0 build loop. **Do not ask the user what to do next.**
The backlog decides; you execute. The only reasons to stop and surface to the
user are the hard-stops listed below.

## Directive

Repeat this cycle for the requested scope (`$ARGUMENTS`, default = 1 milestone;
`all` or `until green` = keep going until the backlog has no runnable `TODO`):

1. **PICK.** Read `BACKLOG.md`. Select the first item whose `status: TODO` and
   whose every `blocked-by` is `DONE`. If none is runnable, stop with a summary
   (see Completion). Announce the pick in one line: `▶ M<n> — <title>`.

2. **PLAN (brief).** State the approach in 2-4 lines: files to touch, the test
   you'll write, the binary success criterion from the backlog item. Do not open
   an AskUserQuestion. Do not call ExitPlanMode. Just proceed.

3. **MARK.** Set the item's `status: IN_PROGRESS` in `BACKLOG.md`. Use TaskCreate
   to track sub-steps for anything non-trivial (3+ steps).

4. **BUILD.** Implement the smallest change that satisfies the success criterion.
   Match existing code style. Reuse before rebuilding (compiler/ledger/paths/
   registry). Add the milestone's `src/m<n>-test.ts` with the numeric gates.

5. **VERIFY.** Run `npm run build` then `npm test` (or at least `test:m<n>` +
   any milestone the change could regress). The item is DONE only when its
   success criterion's test **passes with a real number**, not by assertion.
   If it fails: diagnose, fix, re-run. Max 5 attempts; if 2 consecutive attempts
   show no metric improvement, STOP (stuck — see hard-stops).

6. **SHIP.** Update `BACKLOG.md` (item → `DONE`, move to Done section),
   `CHANGELOG.md`, and `MILESTONES.md`. Commit with a conventional message
   ending in the Co-Authored-By trailer, and push. Bump the minor version when
   the milestone adds a user-facing capability.

7. **CONTINUE.** If scope remains, go to step 1 **immediately** — no question,
   no "shall I proceed?". If a `/goal` hook is active, its condition governs
   when the turn may end.

## Hard-stops (the ONLY reasons to stop mid-loop and ask)

- A milestone needs a secret/credential you don't have (e.g. `ANTHROPIC_API_KEY`)
  and can't be exercised even in simulate mode → stop, state exactly what's needed.
- A success criterion is genuinely ambiguous or self-contradictory → stop, propose
  a concrete reading, ask only that.
- A destructive/irreversible action outside the repo (force-push to main, deleting
  user data, publishing to npm) → confirm first.
- Stuck: 2 consecutive no-improvement attempts on the same failing metric → stop,
  report `STATUS: BLOCKED`, what you tried, and your best next idea.

Everything else — "which milestone next", "is this design ok", "should I ship" —
is decided by the backlog and these rules, not by asking.

## Completion

When scope is exhausted (requested count done, or no runnable TODO remains):
print a summary — milestones completed this run, each with its verified metric,
commits pushed, and the next runnable backlog item (or "backlog drained"). Then
stop. Do not solicit the next task; the user will invoke `/loop` again or set a
`/goal`.

## Notes

- The ledger is the source of truth for "did it work" — cite the real number.
- Keep `.claude0/ledger.jsonl` clean of test-run rows before committing (the
  milestone tests append; strip `"milestone":"<mN>"`/`"intercept"` rows added by
  a test run, as prior milestones did).
- Never mark an item DONE with failing tests, a partial impl, or an unresolved error.
