---
paths:
  - "BACK/prisma/**"
  - "BACK/src/**/*repository.ts"
  - "BACK/src/**/*repositories/*.ts"
---

# Prisma and PostgreSQL

- Scope every tenant-owned query and mutation by `tenantId`, including nested lookups and existence checks. Add a cross-tenant denial test when changing access paths.
- Use a Prisma transaction when a business invariant spans multiple writes. Keep external I/O outside database transactions.
- Select only required data and preserve deterministic ordering for pagination and worker batches.
- Add a new migration for schema changes. Never edit a migration that may have run in another environment and never use `db push` as a production migration strategy.
- Update `schema.prisma`, migration SQL, seeds/fixtures, repository mappings, and tests as one coherent change.
- Run `pnpm exec prisma validate` and `pnpm exec prisma generate`; exercise migrations against a disposable database when the migration history supports replay. The current CI uses `prisma db push` only because a documented legacy migration cannot replay on an empty shadow database.
