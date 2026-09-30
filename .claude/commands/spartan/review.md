---
description: Review backend or cross-cutting JoapyCore changes against the real PR base.
---

# Code review

Resolve the base with `.claude/rules/branches.md`, then inspect the commit list, diff stat, and full `base...HEAD` diff with context.

Review behavior, NestJS boundaries, DTO validation, Prisma transactions and tenant scoping, permissions, event/outbox durability, external-I/O failure modes, concurrency, migrations, tests, and `CONTRIBUTING.md`. Use `.spartan/config.yaml` for focused pnpm verification.

Report actionable findings only, ordered Critical, Important, Minor. Include `file:line`, why it matters, and the concrete correction. Separate standards findings from requirement/spec findings and explicitly say when either pass has no blockers.
