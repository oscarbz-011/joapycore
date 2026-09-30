---
paths:
  - "BACK/**/*.ts"
---

# Backend testing

- Write or update a failing test before implementing a feature or bug fix.
- Unit-test services, policies, adapters, listeners, workers, and repository query contracts at their observable boundaries.
- Add PostgreSQL integration coverage for Prisma behavior, transactions, tenant isolation, migrations, and concurrency-sensitive invariants.
- Add e2e coverage when routing, guards, validation, serialization, or module wiring changes.
- Test success, validation failure, authorization/tenant denial, dependency failure, retry/idempotency, and ambiguous external outcomes when applicable.
- Use disposable databases/Redis namespaces. Never point tests at a developer or production database.
- Before PR, run formatting and ESLint without autofix, TypeScript/build, unit tests, and all applicable integration/e2e suites with pnpm.
