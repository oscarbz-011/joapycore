---
paths:
  - "BACK/src/**/*.ts"
---

# NestJS architecture

- Keep each domain in a Nest module with explicit imports, providers, controllers, and exports.
- Apply authentication, permissions, and required-module guards at controller boundaries. Extract the current tenant/user through the existing decorators.
- Validate request DTOs with `class-validator`; do not accept untyped request bodies or duplicate validation inside controllers.
- Put orchestration and invariants in services. Keep controllers thin and repositories persistence-focused.
- Inject abstractions/contracts for cross-module or external capabilities. Avoid circular module imports and direct access to another module's tables.
- Emit domain events for same-process reactions and use the outbox/queue path when delivery must survive retries or restarts. Make consumers idempotent.
- Treat network destinations, uploaded files, credentials, logs, and error messages as security boundaries; reuse the repository's validation and redaction utilities.
