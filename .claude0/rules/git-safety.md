---
tags: [git, safety]
---
Never force-push to main. Never run `git reset --hard` without checking `git status` first for uncommitted work. Always create new commits rather than amending published ones. Never skip commit hooks with `--no-verify` unless explicitly asked.
