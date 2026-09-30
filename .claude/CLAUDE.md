# JoapyCore project guidance

JoapyCore is a monorepo with two independent pnpm workspaces:

- `BACK/`: NestJS 11, Prisma, PostgreSQL, Redis, BullMQ, Jest.
- `front/`: Next.js 16 App Router, React 19, TypeScript, Tailwind, Vitest.

Use pnpm only. Run commands from the relevant workspace or with `pnpm --dir BACK ...` / `pnpm --dir front ...`. Do not use npm, Yarn, Gradle, Micronaut, Exposed, or Flyway conventions for current project code.

Every database access must preserve tenant isolation. Keep authorization and module guards at HTTP boundaries, pass `tenantId` explicitly into business and persistence operations, scope Prisma reads and writes by tenant, and test cross-tenant denial paths. Do not log secrets, credentials, tokens, or private document content.

Backend changes follow controller → service → repository/Prisma boundaries. Validate request DTOs, keep transactions explicit for multi-record invariants, publish cross-module effects through the existing event/outbox boundaries, and add unit plus applicable integration/e2e coverage. Frontend changes keep server/client boundaries explicit, handle loading/error/empty states, preserve accessibility, and add Vitest coverage for changed behavior.

Before commit, run the smallest relevant checks; before PR, run the complete checks for every affected workspace. The authoritative branch, commit, PR, release, and hotfix policy is [`CONTRIBUTING.md`](../CONTRIBUTING.md). Ordinary work starts from and targets `develop`; `main` is production only.
