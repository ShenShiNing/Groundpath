## Summary

-

## Checks

- [ ] If this PR adds server-side cross-module reuse, the consumer imports through `public/*` instead of a deep import.
- [ ] If this PR expands an existing `public/*` entry, the exports still stay capability-scoped and do not turn into a mega barrel.
- [ ] `pnpm architecture:check` passed locally or is green in CI.
- [ ] If I touched `.dependency-cruiser.cjs` or the baseline file, the PR body explains why.
