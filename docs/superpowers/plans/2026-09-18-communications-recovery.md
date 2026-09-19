# Communications Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task, `superpowers:test-driven-development` for every behavior correction, `superpowers:systematic-debugging` for failures, and `superpowers:verification-before-completion` before claiming success.

**Goal:** Convert the complete pending JoapyCore working tree into reviewable, tested commits and integrate it through a pull request into `develop`, without changing `main`.

**Architecture:** Preserve the existing NestJS/Prisma and Next.js implementation, recover it by bounded domain slices, and keep tests and migrations with the behavior they protect. Shared files are staged by hunk so every commit has one purpose. The finished branch is rebased onto `origin/develop`, reviewed against that base, and merged with a merge commit.

**Tech Stack:** Node.js 22, pnpm 10, NestJS 11, Prisma 7, PostgreSQL 16, Redis 7, BullMQ 6, Next.js 16, React 19, Jest 30, Vitest 3, GitHub Actions, GitHub CLI.

**Spec:** `docs/superpowers/specs/2026-09-18-professional-gitflow-recovery-design.md`

## Global Constraints

- Work only on `feature/shared/communications-recovery` until its PR is merged.
- Preserve every pre-existing user change; do not reset, checkout, clean, or mass-reformat the dirty tree.
- Use pnpm only. If `pnpm` is absent from `PATH`, use the existing explicit pnpm 10 executable; if that is unavailable, request approval to install pnpm 10 with `winget`.
- Stage explicit paths or interactive hunks. Never use `git add .` or `git add -A` in this recovery.
- Before every commit run `git diff --cached --check` and inspect `git diff --cached --stat` plus the full cached patch.
- Do not rewrite any remote shared history. Rebase is allowed only while this branch is private and before review starts.
- Keep `main` untouched. The only PR destination in this plan is `develop`.

---

### Task 1: Establish the recovery baseline and safety references

**Files:**
- Inspect: all modified and untracked paths reported by `git status`
- Inspect: `BACK/package.json`, `front/package.json`, both `pnpm-lock.yaml` files
- Inspect: `.env*`, `*.pem`, `*.key`, and staged patches for accidental secrets

- [ ] Confirm the active branch and capture the starting commit:

  ```powershell
  git branch --show-current
  git rev-parse HEAD
  git status --short
  git log --oneline --decorate -5
  ```

  Expected branch: `feature/shared/communications-recovery`. Expected history includes local commit `46560ba` or its rebased equivalent.

- [ ] Create a local recovery reference before rewriting history:

  ```powershell
  git branch backup/develop-pre-recovery 46560ba
  ```

- [ ] Resolve pnpm without npm or Yarn:

  ```powershell
  Get-Command pnpm -ErrorAction SilentlyContinue
  Test-Path 'C:\Users\oscarbz\AppData\Local\pnpm\pnpm.exe'
  & 'C:\Users\oscarbz\AppData\Local\pnpm\pnpm.exe' --version
  ```

  Require major version 10. If the explicit executable is absent, stop and request permission for `winget install pnpm.pnpm`.

- [ ] Record the complete inventory without changing files:

  ```powershell
  git status --short
  git diff --stat
  git ls-files --others --exclude-standard
  git diff --check
  ```

- [ ] Search for likely credentials before staging:

  ```powershell
  rg -n --hidden --glob '!**/node_modules/**' --glob '!**/pnpm-lock.yaml' '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|postgres(ql)?://[^[:space:]]+:[^[:space:]@]+@)' .
  ```

  Review every match. Configuration examples may contain placeholders; real credentials must be removed before any commit.

### Task 2: Commit the backend mail and queue dependencies

**Files:**
- Modify: `BACK/package.json`
- Modify: `BACK/pnpm-lock.yaml`

- [ ] Inspect package changes and confirm they contain only `bullmq`, `ioredis`, `imapflow`, `mailparser`, and `@types/mailparser` plus their lockfile graph:

  ```powershell
  git diff -- BACK/package.json BACK/pnpm-lock.yaml
  ```

- [ ] Stage and validate only these files:

  ```powershell
  git add -- BACK/package.json BACK/pnpm-lock.yaml
  git diff --cached --check
  git diff --cached
  ```

- [ ] Commit:

  ```powershell
  git commit -m "build(back): agregar dependencias de correo y colas"
  ```

### Task 3: Recover inbound IMAP and the Applications inbox

**Files:**
- Create: `BACK/prisma/migrations/20260916213000_application_email_inbox/migration.sql`
- Modify by hunk: `BACK/prisma/schema.prisma` (`Tenant.appEmailInboxMessages` and `AppEmailInboxMessage` only)
- Modify: `BACK/src/applications/application-email.repository.ts`
- Modify: `BACK/src/applications/application-email.service.ts`
- Modify: `BACK/src/applications/application-email.service.spec.ts`
- Modify: `BACK/src/applications/applications.controller.ts`
- Modify: `BACK/src/applications/applications.module.ts`
- Modify: `BACK/src/integrations/integrations.controller.ts`
- Modify: `BACK/src/integrations/integrations.module.ts`
- Modify: `BACK/src/integrations/integrations.service.ts`
- Modify: `BACK/src/integrations/integrations.service.spec.ts`
- Create: `BACK/src/integrations/dto/update-incoming-email-integration.dto.ts`
- Create: `BACK/src/integrations/imap-connection.service.ts`
- Modify: `front/app/(dashboard)/dashboard/applications/email/page.tsx`
- Create: `front/app/(dashboard)/dashboard/applications/email/legacy-email.tsx`
- Modify by hunk: `front/app/(dashboard)/dashboard/settings/page.tsx` (IMAP form and SMTP test behavior only)
- Modify: `front/lib/api/applications.ts`
- Modify: `front/lib/api/integrations.ts`

- [ ] Run the existing focused tests before altering this slice. If a test fails, diagnose whether the recovered implementation or the test is wrong before editing:

  ```powershell
  Set-Location BACK
  pnpm test --runInBand --runTestsByPath src/applications/application-email.service.spec.ts src/integrations/integrations.service.spec.ts
  Set-Location ..
  ```

- [ ] Review tenant isolation, mailbox/UID idempotency, encrypted password handling, TLS defaults, and DTO validation. Add or correct Jest cases test-first for any missing guarantee.

- [ ] Stage the listed paths. Use `git add -p -- BACK/prisma/schema.prisma` and `git add -p -- 'front/app/(dashboard)/dashboard/settings/page.tsx'` to exclude finance, communications, and user-profile hunks.

- [ ] Validate the migration and focused tests:

  ```powershell
  Set-Location BACK
  pnpm exec prisma validate
  pnpm test --runInBand --runTestsByPath src/applications/application-email.service.spec.ts src/integrations/integrations.service.spec.ts
  Set-Location ..
  git diff --cached --check
  git diff --cached
  ```

- [ ] Commit:

  ```powershell
  git commit -m "feat(applications): agregar recepción de correo IMAP"
  ```

### Task 4: Recover secure authenticated-user email changes

**Files:**
- Create: `BACK/src/users/dto/change-email.dto.ts`
- Modify: `BACK/src/users/controllers/users.controller.ts`
- Modify: `BACK/src/users/services/users.service.ts`
- Modify: `BACK/src/users/users.service.spec.ts`
- Modify by hunk: `front/app/(dashboard)/dashboard/settings/page.tsx` (profile email, password confirmation, phone, reset, and session refresh only)
- Modify: `front/lib/api/users.ts`

- [ ] Run the existing user service tests, then add or correct tests first for current-password verification, normalized unique email, session-safe response, and unchanged-email behavior.

  ```powershell
  Set-Location BACK
  pnpm test --runInBand --runTestsByPath src/users/users.service.spec.ts
  Set-Location ..
  ```

- [ ] Stage only the user-email paths/hunks and verify the cached patch excludes IMAP and communications.

- [ ] Run focused backend tests and frontend type checking:

  ```powershell
  Set-Location BACK
  pnpm test --runInBand --runTestsByPath src/users/users.service.spec.ts
  Set-Location ../front
  pnpm exec tsc --noEmit
  Set-Location ..
  git diff --cached --check
  ```

- [ ] Commit:

  ```powershell
  git commit -m "feat(users): proteger el cambio de correo personal"
  ```

### Task 5: Recover credit-sale stock validation

**Files:**
- Modify: `BACK/src/modules/sales/services/sale-orders.service.ts`
- Modify: `BACK/src/modules/sales/services/sale-orders.service.spec.ts`
- Modify: `front/app/(dashboard)/dashboard/sales/[id]/adjust/page.tsx`
- Modify: `front/app/(dashboard)/dashboard/sales/page.tsx`
- Modify: `front/components/sales/order-line-items.tsx`

- [ ] Run the current sale-order tests and identify the new red/green cases for insufficient stock both when creating and approving a credit sale.

  ```powershell
  Set-Location BACK
  pnpm test --runInBand --runTestsByPath src/modules/sales/services/sale-orders.service.spec.ts
  Set-Location ..
  ```

- [ ] Verify stock checks occur inside the appropriate transaction and produce a stable API error consumed by both frontend screens.

- [ ] Stage only the sales files, run the focused Jest test and frontend type check, inspect the cached patch, and commit:

  ```powershell
  git commit -m "fix(sales): validar stock en ventas a crédito"
  ```

### Task 6: Recover overdue-interest behavior

**Files:**
- Modify by hunk: `BACK/prisma/schema.prisma` (interest-frequency comments only)
- Modify: `BACK/src/modules/finance/events/finance-on-sale.listener.ts`
- Modify: `BACK/src/modules/finance/repositories/finance-sources.repository.ts`
- Modify: `BACK/src/modules/finance/repositories/installments.repository.ts`
- Modify: `BACK/src/modules/finance/services/installments-scheduler.service.ts`
- Modify: `BACK/src/modules/finance/services/installments-scheduler.service.spec.ts`
- Modify: `BACK/src/modules/finance/services/interest-calc.service.ts`
- Modify: `BACK/src/modules/finance/services/interest-calc.service.spec.ts`
- Modify: `BACK/src/modules/finance/services/loans.service.ts`
- Modify: `BACK/src/modules/finance/services/loans.service.spec.ts`
- Modify: `front/app/(dashboard)/dashboard/payments/page.tsx`
- Modify: `front/app/(dashboard)/dashboard/settings/credit/page.tsx`
- Modify: `front/lib/api/finance.ts`

- [ ] Run the three finance suites and retain/add tests for the first overdue day, each started 30-day period, cumulative versus non-cumulative components, refresh behavior, and tenant boundaries.

  ```powershell
  Set-Location BACK
  pnpm test --runInBand --runTestsByPath src/modules/finance/services/installments-scheduler.service.spec.ts src/modules/finance/services/interest-calc.service.spec.ts src/modules/finance/services/loans.service.spec.ts
  Set-Location ..
  ```

- [ ] Stage the finance paths and only the finance comment hunks from `schema.prisma`. Run focused tests, frontend type checking, and cached-diff checks.

- [ ] Commit:

  ```powershell
  git commit -m "fix(finance): actualizar la mora por períodos iniciados"
  ```

### Task 7: Recover invoice PDF generation and email-delivery results

**Files:**
- Modify: `BACK/src/email/email.service.ts`
- Create: `BACK/src/email/email.service.spec.ts`
- Modify: `BACK/src/modules/billing/controllers/invoices.controller.ts`
- Modify: `BACK/src/modules/billing/repositories/invoices.repository.ts`
- Modify: `BACK/src/modules/billing/services/invoices.service.ts`
- Modify: `BACK/src/modules/billing/services/invoices.service.spec.ts`
- Modify: `BACK/src/modules/documents/controllers/documents.controller.ts`
- Modify: `BACK/src/modules/documents/documents.service.spec.ts`
- Modify: `BACK/src/modules/documents/events/invoice-on-issue.listener.ts`
- Modify: `BACK/src/modules/documents/services/documents.service.ts`
- Modify: `front/app/(dashboard)/dashboard/billing/invoices/[id]/page.tsx`
- Modify: `front/components/contract-card.tsx`
- Modify: `front/lib/api/billing.ts`
- Modify: `front/lib/api/documents.ts`

- [ ] Run the existing billing, document, and email suites. Ensure tests cover keeping the invoice pending until the PDF is persisted, retrying PDF generation idempotently, and returning the accepted recipient/provider message ID from SMTP.

  ```powershell
  Set-Location BACK
  pnpm test --runInBand --runTestsByPath src/email/email.service.spec.ts src/modules/billing/services/invoices.service.spec.ts src/modules/documents/documents.service.spec.ts
  Set-Location ..
  ```

- [ ] Stage only the listed files. Exclude communications-specific consumers from this commit.

- [ ] Run the focused suites, frontend type check, and cached-diff checks; then commit:

  ```powershell
  git commit -m "fix(billing): hacer recuperable la emisión de facturas"
  ```

### Task 8: Recover the Communications backend vertical

**Files:**
- Create: `BACK/prisma/migrations/20260918010000_communications_vertical/migration.sql`
- Modify by hunk: `BACK/prisma/schema.prisma` (communications enum/models only)
- Create/modify: `BACK/src/communications/**`
- Create: `BACK/src/common/pipes/app-validation.pipe.ts`
- Create: `BACK/src/common/pipes/app-validation.pipe.spec.ts`
- Modify: `BACK/src/app.module.ts`
- Modify: `BACK/src/app.setup.ts`
- Modify: `BACK/src/main.ts`
- Modify: `BACK/src/common/constants/permissions.constant.ts`
- Modify: `BACK/src/notifications/listeners/ws-bridge.listener.ts`
- Create: `BACK/src/notifications/listeners/ws-bridge.listener.spec.ts`
- Modify: `BACK/test/app.e2e-spec.ts`

- [ ] Inventory `BACK/src/communications` and map its public API, repository transactions, BullMQ producer/worker, SMTP provider, event listeners, authorization, idempotency keys, retry states, and notification/WebSocket behavior.

- [ ] Run all communications, validation-pipe, notification, and application e2e tests that exist. For uncovered invariants, add a failing test before correcting implementation.

  ```powershell
  Set-Location BACK
  pnpm test --runInBand --testPathPatterns='communications|app-validation|ws-bridge'
  pnpm test:e2e --testPathPatterns=app.e2e-spec
  Set-Location ..
  ```

- [ ] Verify tenant scoping on every query/mutation; durable message creation before enqueue; idempotent send requests; safe worker locking/retry; no plaintext integration credentials in API responses or logs; private WebSocket routing; and validation errors compatible with existing clients.

- [ ] Reconcile the intentional replacement of `ApplicationsModule` by `CommunicationHubModule`: verify that no documented or linked IMAP endpoint is presented as active after the replacement. If the legacy inbox remains supported, import both modules and retain its authorization tests; otherwise label the legacy code and route as inactive in the communications documentation.

- [ ] Stage the listed paths plus only communications hunks from `schema.prisma`. Run Prisma validation, focused tests, backend build, and cached-diff checks.

- [ ] Commit:

  ```powershell
  git commit -m "feat(communications): agregar entrega durable de facturas"
  ```

### Task 9: Recover the Communications frontend vertical

**Files:**
- Create: `front/app/(dashboard)/dashboard/applications/communications/**`
- Create: `front/components/communications/**`
- Create: `front/lib/api/communications.ts`
- Modify: `front/app/(dashboard)/dashboard/applications/email/page.tsx` (redirect to Communications only)
- Modify: `front/app/(dashboard)/dashboard/components/sidebar.tsx`
- Modify: `front/app/(dashboard)/dashboard/layout.tsx`
- Modify: `front/lib/permissions.ts`
- Modify: `front/lib/route-access.ts`
- Modify: `front/lib/route-access.test.ts`

- [ ] Run route-access tests before changes. Add/retain cases for users with and without `communications:access`, legacy email redirect behavior, and direct navigation protection.

  ```powershell
  Set-Location front
  pnpm test -- lib/route-access.test.ts
  Set-Location ..
  ```

- [ ] Review loading, empty, error, retry, permission, and stale-query states for the timeline, settings, notes, send-invoice action, and notification navigation.

- [ ] Stage only the listed frontend paths/hunks. Run Vitest, TypeScript, lint without autofix, and the production build:

  ```powershell
  Set-Location front
  pnpm test -- lib/route-access.test.ts
  pnpm exec tsc --noEmit
  pnpm exec eslint .
  pnpm build
  Set-Location ..
  git diff --cached --check
  ```

- [ ] Commit:

  ```powershell
  git commit -m "feat(front): agregar centro de comunicaciones"
  ```

### Task 10: Recover integration infrastructure and operational documentation

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.gitignore`
- Modify: `BACK/.env.example`
- Create: `BACK/test/communications.int-spec.ts`
- Modify: `docker-compose.yml`
- Create/modify: `docs/communications/**`

- [ ] Confirm Docker Compose adds Redis without weakening PostgreSQL, MinIO, MailDev, or Gotenberg configuration. Confirm `.env.example` contains placeholders and defaults only.

- [ ] Review `BACK/test/communications.int-spec.ts` for isolated database naming, cleanup in success/failure paths, Redis isolation, tenant isolation, duplicate-request handling, retry/failure recording, and no dependence on developer data.

- [ ] Start only required services and run the isolated integration test:

  ```powershell
  docker compose up -d postgres redis
  docker compose exec -T postgres dropdb --if-exists -U joapycore joapycore_comms_test_local
  docker compose exec -T postgres createdb -U joapycore joapycore_comms_test_local
  Set-Location BACK
  $env:DATABASE_URL='postgresql://joapycore:joapycore@localhost:5435/joapycore_comms_test_local'
  $env:COMMUNICATIONS_TEST_DATABASE_URL='postgresql://joapycore:joapycore@localhost:5435/joapycore_comms_test_local'
  $env:COMMUNICATIONS_TEST_REDIS_URL='redis://localhost:6379'
  pnpm exec prisma db push
  pnpm test:int --testPathPatterns=communications.int-spec
  Remove-Item Env:DATABASE_URL
  Remove-Item Env:COMMUNICATIONS_TEST_DATABASE_URL
  Remove-Item Env:COMMUNICATIONS_TEST_REDIS_URL
  Set-Location ..
  ```

- [ ] Stage `.github/workflows/ci.yml`, `.gitignore`, `BACK/.env.example`, `BACK/test/communications.int-spec.ts`, and `docker-compose.yml`. Inspect CI for pnpm 10, Node 22, PostgreSQL/Redis health checks, the correct Jest CLI syntax, and PR triggers for both principal branches.

- [ ] Commit:

  ```powershell
  git commit -m "test(communications): cubrir integración con PostgreSQL y Redis"
  ```

- [ ] Stage the two communications guides separately and verify that they match the final module activation and retry semantics:

  ```powershell
  git add -- docs/communications/README.md docs/communications/architecture.md
  git diff --cached --check
  git diff --cached
  git commit -m "docs(communications): documentar operación y recuperación"
  ```

### Task 11: Prove no pending work was lost or left behind

**Files:**
- Inspect: complete repository status and diff

- [ ] Confirm every original path is committed and no accidental generated file entered history:

  ```powershell
  git status --short
  git diff --check
  git log --oneline --decorate backup/develop-pre-recovery..HEAD
  ```

  Expected: clean working tree. If anything remains, classify it into the preceding domain commit or a separate justified `refactor`, `test`, `docs`, or `style` commit; never hide leftovers in a catch-all commit.

- [ ] Compare the recovered branch tree to the original safety reference plus original working-tree inventory. Verify no path was discarded and review `.gitignore` for overly broad exclusions.

### Task 12: Run the complete verification matrix

**Files:**
- Verify: complete backend and frontend

- [ ] Backend clean checks:

  ```powershell
  Set-Location BACK
  pnpm install --frozen-lockfile
  pnpm exec prisma generate
  pnpm exec prisma validate
  pnpm exec prettier --check "src/**/*.ts" "test/**/*.ts"
  pnpm exec eslint "{src,test}/**/*.ts"
  pnpm build
  pnpm test --runInBand
  Set-Location ..
  ```

- [ ] Backend database checks against disposable data only:

  ```powershell
  docker compose up -d postgres redis
  docker compose exec -T postgres dropdb --if-exists -U joapycore joapycore_recovery_test
  docker compose exec -T postgres createdb -U joapycore joapycore_recovery_test
  Set-Location BACK
  $env:DATABASE_URL='postgresql://joapycore:joapycore@localhost:5435/joapycore_recovery_test'
  pnpm exec prisma db push
  pnpm test:int
  pnpm test:e2e
  Remove-Item Env:DATABASE_URL
  Set-Location ..
  ```

- [ ] Communications isolated integration check using the exact environment from Task 10.

- [ ] Frontend clean checks:

  ```powershell
  Set-Location front
  pnpm install --frozen-lockfile
  pnpm exec tsc --noEmit
  pnpm exec eslint .
  pnpm test
  pnpm build
  Set-Location ..
  ```

- [ ] Repository checks:

  ```powershell
  git diff --check
  git status --short
  ```

  Record exact commands, pass/fail counts, and any explicitly unverified external behavior. Do not claim real SMTP delivery or visual QA unless separately exercised.

### Task 13: Synchronize the private branch with remote `develop`

**Files:**
- Modify: Git history only

- [ ] Fetch remote refs and inspect divergence:

  ```powershell
  git fetch origin
  git log --oneline --left-right --graph origin/develop...HEAD
  ```

- [ ] Rebase the unpublished recovery branch onto `origin/develop`:

  ```powershell
  git rebase origin/develop
  ```

  If conflicts occur, use `resolving-merge-conflicts`, preserve both the remote CI correction and recovered behavior, then rerun the full verification matrix.

- [ ] Move the local principal branch to the remote principal branch only after the recovery work is safely on the feature branch:

  ```powershell
  git branch -f develop origin/develop
  ```

- [ ] Rerun Task 12 after the rebase and confirm the tree is clean.

### Task 14: Review, publish, open the PR, and merge to `develop`

**Files:**
- Review: `origin/develop...HEAD`
- Create: GitHub pull request metadata

- [ ] Invoke the `code-review` skill against `origin/develop`. It must run Standards and Spec reviews independently and report both. Resolve every blocking finding with a focused commit and rerun affected plus full verification.

- [ ] Push the branch without force:

  ```powershell
  git push -u origin feature/shared/communications-recovery
  ```

- [ ] Prepare the PR body with the `pr` skill. Include summary, motivation, commit map, migrations, test evidence, risks, rollback, and explicit limitations. Open it against `develop`:

  ```powershell
  $prBodyPath = Join-Path ([System.IO.Path]::GetTempPath()) 'joapycore-communications-recovery-pr.md'
  gh pr create --base develop --head feature/shared/communications-recovery --title "feat(communications): recuperar trabajo funcional pendiente" --body-file $prBodyPath
  ```

- [ ] Inspect CI and review results. Fix failures on the feature branch; never bypass checks or redirect the PR to `main`.

- [ ] After all checks and review are green, merge with a merge commit and delete the remote branch:

  ```powershell
  gh pr merge --merge --delete-branch
  ```

- [ ] Update local `develop`, verify the merge, and delete the safety reference only after remote confirmation:

  ```powershell
  git switch develop
  git pull --ff-only origin develop
  git branch -d backup/develop-pre-recovery
  git status --short --branch
  git log --oneline --decorate -5
  ```

  Expected: clean `develop` aligned with `origin/develop`; `main` unchanged.
