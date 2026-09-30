---
description: Implement a JoapyCore change from a written requirement through tests, review, and PR readiness.
---

# Build

1. Read `.claude/CLAUDE.md`, `.spartan/config.yaml`, `CONTRIBUTING.md`, and the rules matching the affected paths.
2. Confirm the current branch is a correctly named topic branch based on `develop`; create the appropriate branch before editing if necessary.
3. Clarify only decisions that materially change behavior. Record a multi-step implementation plan.
4. Work test-first: reproduce or add a failing test, implement the minimum behavior, then refactor while green.
5. Preserve tenant isolation, authorization, module boundaries, and event/outbox guarantees.
6. Run the affected workspace commands from `.spartan/config.yaml`. Before PR, run all applicable backend or frontend checks.
7. Stage explicit paths, inspect the cached diff, and create atomic Conventional Commits. Do not assume every task has a ticket.
8. Run `/spartan:gate-review`, resolve blockers, then `/spartan:pr-ready`.
