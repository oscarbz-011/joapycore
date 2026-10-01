---
paths:
  - "BACK/**/*.ts"
---

# Backend boundaries

Use JoapyCore's actual NestJS layering:

1. Controllers handle HTTP concerns, guards, validated DTOs, tenant/user context, and response mapping.
2. Services own use-case orchestration and business invariants.
3. Repositories own Prisma queries and persistence mapping.
4. Adapters own external systems such as SMTP, S3, IMAP, Redis, or third-party APIs.

Controllers must not query Prisma or repositories directly. Repositories must not make business decisions or call external systems. Keep cross-module dependencies behind existing contracts; use domain events/outbox delivery when side effects must be durable.

Pass `tenantId` explicitly through every layer and include it in every tenant-owned read, update, delete, uniqueness check, and transaction. Never trust an entity ID alone as proof of tenant ownership.
