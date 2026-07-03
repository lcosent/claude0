---
tags: [testing]
---
Every bug fix needs a regression test. Prefer integration tests against real dependencies over mocks unless the dependency is prohibitively slow or non-deterministic. Run the full suite before claiming a fix is complete.
