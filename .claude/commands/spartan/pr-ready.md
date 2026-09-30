---
description: Verify a JoapyCore branch and produce complete PR metadata for its real destination.
---

# PR ready

1. Read `CONTRIBUTING.md` and resolve the actual base with `.claude/rules/branches.md`.
2. Stop on `develop` or `main` unless the task is explicit synchronization/release verification; never manufacture a PR from a permanent branch to itself.
3. Confirm branch naming, atomic commits, no unintended files/secrets, a clean worktree, and no divergence that requires synchronization.
4. Run the relevant pnpm checks and record exact commands/results. Run `/spartan:gate-review` and require no Critical or Important finding.
5. Build the PR body from `.github/pull_request_template.md`: summary, motivation, issue, classification, changes, verification, migrations/data, security/tenant isolation, risks, rollback, and UI evidence.
6. Push without force and create the PR using the resolved base. Verify CI and PR Policy; do not merge a failing PR.
