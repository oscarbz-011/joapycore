# Professional Gitflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task, `writing-for-agents` for agent-facing guidance, `superpowers:test-driven-development` for the policy validator, and `superpowers:verification-before-completion` before claiming success.

**Goal:** Make `develop` the enforced integration path for ordinary work, reserve `main` for releases and hotfixes, and align repository documentation, CI, PR tooling, and `.claude` guidance with JoapyCore's real stack.

**Architecture:** `CONTRIBUTING.md` becomes the human-readable source of truth. A small pure JavaScript policy module validates PR title, source branch, and target branch in GitHub Actions. `.claude` and Spartan commands point to the same policy and infer the comparison base from the current PR/branch rather than hard-coding `main`. Historical non-JoapyCore rules remain available only outside automatic project guidance.

**Tech Stack:** Git, GitHub Actions, GitHub CLI, Node.js 22 built-in test runner, pnpm 10, Markdown, YAML, Claude Code project guidance.

**Spec:** `docs/superpowers/specs/2026-09-18-professional-gitflow-recovery-design.md`

## Global Constraints

- Start only after the recovery PR has merged and local `develop` is clean and current.
- Create `chore/shared/professional-gitflow` from updated `develop`; PR destination is `develop`.
- Do not merge or promote anything to `main` in this task.
- Use pnpm for repository package operations. The standalone policy tests use `node --test` and need no new package.
- Keep one authoritative policy in `CONTRIBUTING.md`; other guidance links to it rather than duplicating divergent rules.
- Preserve useful historical Spartan material, but ensure Micronaut/Kotlin/Gradle/Exposed/Flyway instructions do not automatically govern NestJS/Prisma files.
- GitHub CI is advisory until repository rulesets/branch protection become available for the private repository plan; document that limitation explicitly.

---

### Task 1: Create the workflow branch from verified `develop`

**Files:**
- Inspect: current repository status and principal refs

- [ ] Confirm recovery integration and a clean base:

  ```powershell
  git switch develop
  git fetch origin
  git pull --ff-only origin develop
  git status --short --branch
  git log --oneline --decorate -5
  ```

- [ ] Create the dedicated branch:

  ```powershell
  git switch -c chore/shared/professional-gitflow
  ```

### Task 2: Add the authoritative contribution and Gitflow guide

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `.github/pull_request_template.md`

- [ ] Write `CONTRIBUTING.md` with these exact policy sections:

  - permanent branches: `develop` for integration, `main` for production;
  - branch matrix for `feature`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`, `release`, and `hotfix`;
  - preferred `<type>/<scope>/<ticket>-<slug>` naming, optional ticket when none exists, scopes `back|front|shared|infra`;
  - branch bases and PR targets;
  - Conventional Commit titles and atomic staging;
  - required tests, review, merge commits, deletion, and no direct pushes;
  - release flow `develop -> release/<semver> -> main`, annotated SemVer tag, then synchronization to `develop`;
  - hotfix flow from deployed `main` tag to `main`, annotated tag, then the identical fix to `develop`;
  - private-branch rebase versus shared-branch merge rule and no force-push after review begins;
  - current GitHub plan limitation and recommendation to enable a remote ruleset before adding collaborators.

- [ ] Write `.github/pull_request_template.md` with required checklists/fields: summary, motivation, linked issue, type/scope, changes, verification commands and results, migrations/data impact, security/tenant isolation, risks, rollback, screenshots for UI, and reviewer checklist.

- [ ] Validate wording against the approved spec and attached strategy; ensure JoapyCore's chosen names override generic examples from the attachment.

- [ ] Stage and commit:

  ```powershell
  git add -- CONTRIBUTING.md .github/pull_request_template.md
  git diff --cached --check
  git diff --cached
  git commit -m "docs(workflow): definir Gitflow y revisión de cambios"
  ```

### Task 3: Build the PR policy validator test-first

**Files:**
- Create: `.github/scripts/pr-policy.mjs`
- Create: `.github/scripts/pr-policy.test.mjs`

- [ ] Write failing `node:test` table cases before implementation. Cover at least:

  | Head | Base | Title | Result |
  | --- | --- | --- | --- |
  | `feature/back/123-orders` | `develop` | `feat(sales): add orders` | allow |
  | `fix/front/invoice-retry` | `develop` | `fix(billing): retry PDF` | allow |
  | `refactor/shared/events` | `develop` | `refactor(events): simplify outbox` | allow |
  | `chore/infra/ci-policy` | `develop` | `ci(workflow): validate PRs` | allow |
  | `feature/back/orders` | `main` | valid | deny |
  | `release/1.4.0` | `main` | `chore(release): 1.4.0` | allow |
  | `release/1.4` | `main` | valid | deny |
  | `hotfix/back/1.4.1-invoice` | `main` | `fix(billing): recover invoices` | allow |
  | `hotfix/back/1.4.1-invoice` | `develop` | valid | allow for back-merge |
  | `release/1.4.0` | `develop` | `chore(release): 1.4.0` | allow for release back-merge |
  | `develop` | `main` | `chore(release): 1.4.0` | deny; use a release branch |
  | uppercase or underscore branch | `develop` | valid | deny |
  | valid branch | `develop` | non-Conventional title | deny |

- [ ] Run tests and confirm RED because the validator is not implemented:

  ```powershell
  node --test .github/scripts/pr-policy.test.mjs
  ```

- [ ] Implement pure exported functions in `pr-policy.mjs`:

  - `validateTitle(title)` accepts `feat|fix|refactor|perf|docs|test|build|ci|chore|revert`, optional scope, optional `!`, colon, and non-empty subject;
  - `classifyBranch(head)` recognizes ordinary topic, `release/<semver>`, `hotfix/<scope>/<slug>`, and permanent branches so direct principal-branch PRs can be rejected explicitly;
  - `validatePullRequest({ head, base, title })` returns all actionable errors;
  - CLI mode reads `HEAD_REF`, `BASE_REF`, and `PR_TITLE`, prints errors, and exits non-zero on rejection.

- [ ] Run tests and confirm GREEN:

  ```powershell
  node --test .github/scripts/pr-policy.test.mjs
  ```

- [ ] Refactor duplicated regular expressions into named constants, rerun tests, then stage and commit:

  ```powershell
  git add -- .github/scripts/pr-policy.mjs .github/scripts/pr-policy.test.mjs
  git diff --cached --check
  git diff --cached
  git commit -m "test(workflow): definir política verificable de PR"
  ```

### Task 4: Enforce PR policy in GitHub Actions

**Files:**
- Create: `.github/workflows/pr-policy.yml`
- Verify: `.github/workflows/ci.yml`

- [ ] Add a least-privilege workflow triggered by `pull_request` for `develop` and `main`, with `permissions: contents: read`, Node.js 22, and no dependency installation.

- [ ] Pass trusted event fields as environment variables and run both the unit test and live validation:

  ```yaml
  env:
    HEAD_REF: ${{ github.head_ref }}
    BASE_REF: ${{ github.base_ref }}
    PR_TITLE: ${{ github.event.pull_request.title }}
  ```

  Commands: `node --test .github/scripts/pr-policy.test.mjs` and `node .github/scripts/pr-policy.mjs`.

- [ ] Verify `.github/workflows/ci.yml` still runs functional checks on PRs/pushes for `develop` and `main`, uses pnpm 10/Node 22, and does not duplicate policy logic.

- [ ] Parse both workflow files and inspect the diff. If a YAML parser is not locally available, use Ruby/Python only for read-only parsing, not to edit files.

- [ ] Stage and commit:

  ```powershell
  git add -- .github/workflows/pr-policy.yml
  git diff --cached --check
  git diff --cached
  git commit -m "ci(workflow): validar ramas y títulos de PR"
  ```

### Task 5: Make `.claude` project guidance JoapyCore-specific

**Files:**
- Modify: `.claude/CLAUDE.md`
- Create: `.spartan/config.yaml`
- Rename: `.claude/rules/braches.md` to `.claude/rules/branches.md`
- Rename: `.claude/rules/commits-frecuency.md` to `.claude/rules/commit-frequency.md`
- Modify: `.claude/rules/branches.md`
- Modify: `.claude/rules/commits.md`
- Modify: `.claude/rules/commit-frequency.md`
- Modify: `.claude/.spartan-packs`

- [ ] Replace generic manager guidance in `.claude/CLAUDE.md` with concise always-on facts: monorepo layout, NestJS/Prisma/PostgreSQL/Redis/BullMQ backend, Next.js/React frontend, pnpm-only commands, tenant isolation/security constraints, test expectations, and a link to `CONTRIBUTING.md` for Gitflow.

- [ ] Add `.spartan/config.yaml` so project-aware Spartan commands resolve the real languages, workspaces, build/test commands, and default integration branch `develop` without auto-selecting Micronaut/Gradle conventions.

- [ ] Correct misspelled rule filenames with `git mv`. Make each file concise and point branch/commit details to `CONTRIBUTING.md`. Remove the unconditional requirement to log every commit in `GC_PENDIENTS.md`; retain explicit staging, atomic commits, and no co-author trailers.

- [ ] Update `.claude/.spartan-packs` so automatically loaded packs do not include incompatible `backend-micronaut` or Exposed/Flyway database guidance for this project. Keep unrelated reference content on disk.

- [ ] Search the active guidance for contradictions:

  ```powershell
  rg -n -i '(npm|yarn|gradle|micronaut|exposed|flyway|master|pull request.*main|--base main)' .claude/CLAUDE.md .claude/rules .spartan/config.yaml .claude/.spartan-packs
  ```

  Every remaining match must be explicitly path-scoped historical reference or removed from automatic guidance.

- [ ] Stage and commit:

  ```powershell
  git add -- .claude/CLAUDE.md .claude/rules/branches.md .claude/rules/commits.md .claude/rules/commit-frequency.md .claude/.spartan-packs .spartan/config.yaml
  git add -u -- .claude/rules/braches.md .claude/rules/commits-frecuency.md
  git diff --cached --check
  git diff --cached
  git commit -m "docs(agents): alinear contexto con JoapyCore"
  ```

### Task 6: Scope or replace incompatible automatic architecture rules

**Files:**
- Modify: `.claude/rules/shared-backend/ARCHITECTURE.md`
- Modify: `.claude/rules/frontend-react/FRONTEND.md`
- Modify or relocate from automatic scope: `.claude/rules/backend-micronaut/**`
- Modify or relocate from automatic scope: `.claude/rules/database/**`
- Create as needed: `.claude/rules/backend-nestjs/ARCHITECTURE.md`
- Create as needed: `.claude/rules/backend-nestjs/PRISMA.md`
- Create as needed: `.claude/rules/backend-nestjs/TESTING.md`

- [ ] Use `writing-for-agents` to make rules short, imperative, and path-scoped. NestJS rules must encode module/controller/service/repository responsibilities, DTO validation, tenant-scoped queries, Prisma migration discipline, outbox/event boundaries, and unit/integration/e2e expectations.

- [ ] Replace the incorrect Controller-to-Manager requirement in `shared-backend/ARCHITECTURE.md` with the actual NestJS layering or restrict the old file to non-project historical paths that do not match `BACK/**`.

- [ ] Change frontend package examples to pnpm and align them with `front/package.json` scripts.

- [ ] Preserve Micronaut/Kotlin/Gradle/Exposed/Flyway material as historical reference by moving it under `.claude/reference/legacy-spartan/` or applying frontmatter/path patterns that cannot match current JoapyCore source. Do not silently delete potentially useful source material.

- [ ] Search all automatically active rules and confirm no incompatible instruction can apply to `BACK/**/*.ts`, `BACK/prisma/**`, or `front/**/*.{ts,tsx}`.

- [ ] Stage and commit:

  ```powershell
  git add -- .claude/rules .claude/reference/legacy-spartan
  git diff --cached --check
  git diff --cached
  git commit -m "docs(agents): corregir reglas de arquitectura activas"
  ```

### Task 7: Align Spartan build, debug, review, and PR commands

**Files:**
- Modify: `.claude/commands/spartan/build.md`
- Modify: `.claude/commands/spartan/debug.md`
- Modify: `.claude/commands/spartan/fe-review.md`
- Modify: `.claude/commands/spartan/gate-review.md`
- Modify: `.claude/commands/spartan/pr-ready.md`
- Modify: `.claude/commands/spartan/review.md`
- Modify: `.claude/commands/spartan/commit-message.md`
- Modify: `.claude/commands/spartan/commit-message-with-codex.md`
- Modify: `.claude/commands/spartan/ship-pr.md`
- Modify: `.claude/commands/spartan/ship-pr-codex.md`
- Modify: `.claude/commands/spartan.md`
- Modify: `.claude/codex/spartan.zsh`

- [ ] Define one base-resolution algorithm in the agent instructions:

  1. If an open PR exists, use its actual base.
  2. For `release/*` and primary hotfix PRs, use `main`.
  3. For ordinary topic branches and hotfix back-merges, use `develop`.
  4. On `develop`, compare to `origin/develop` only for synchronization checks; never manufacture a PR to itself.
  5. On `main`, stop unless the explicit task is release/hotfix verification.

- [ ] Replace npm/Yarn/Gradle build examples with exact workspace commands from `BACK/package.json`, `front/package.json`, and `.github/workflows/ci.yml`.

- [ ] Remove assumptions that every work item has an LBF ticket. Preserve the ticket in branch/commit/PR text when one exists; otherwise proceed with a descriptive slug.

- [ ] Replace any unsafe blanket staging (`git add .`, `git add -A`) with explicit path staging and cached-patch inspection.

- [ ] Update `spartan.zsh` default branch resolution from `master/main/dev/develop` ordering to PR base first, then `develop`, with `main` selected only for release/hotfix flows. Keep shell behavior portable and quote refs.

- [ ] Run targeted contradiction searches:

  ```powershell
  rg -n -i '(--base main|origin/main|git diff main|default.*master|git add \.|git add -A|npm |yarn |gradle)' .claude/commands/spartan .claude/commands/spartan.md .claude/codex/spartan.zsh
  ```

  Review every match. A `main` match is acceptable only inside explicit release/hotfix logic or explanatory policy.

- [ ] Stage and commit:

  ```powershell
  git add -- .claude/commands/spartan .claude/commands/spartan.md .claude/codex/spartan.zsh
  git diff --cached --check
  git diff --cached
  git commit -m "refactor(workflow): resolver la base real de cada PR"
  ```

### Task 8: Verify policy, guidance, and repository integration

**Files:**
- Verify: all files changed by this plan

- [ ] Run policy tests and direct CLI examples:

  ```powershell
  node --test .github/scripts/pr-policy.test.mjs
  $env:HEAD_REF='feature/back/123-orders'; $env:BASE_REF='develop'; $env:PR_TITLE='feat(sales): add orders'; node .github/scripts/pr-policy.mjs
  $env:HEAD_REF='feature/back/orders'; $env:BASE_REF='main'; $env:PR_TITLE='feat(sales): add orders'; node .github/scripts/pr-policy.mjs
  Remove-Item Env:HEAD_REF; Remove-Item Env:BASE_REF; Remove-Item Env:PR_TITLE
  ```

  Expected: first invocation exits 0; second exits non-zero with an actionable target-branch error.

- [ ] Run structural searches and require no unexplained contradiction:

  ```powershell
  rg -n -i '(npm|yarn|gradle|micronaut|exposed|flyway)' .claude/CLAUDE.md .spartan/config.yaml .claude/.spartan-packs .claude/rules/backend-nestjs .claude/rules/shared-backend .claude/rules/frontend-react
  rg -n '(--base main|origin/main|git diff main)' .claude/commands/spartan .claude/codex/spartan.zsh
  rg -n 'develop|main|feature/|hotfix/|release/' CONTRIBUTING.md .claude/CLAUDE.md .claude/rules/branches.md .github/scripts/pr-policy.mjs
  ```

- [ ] Run repository regression checks because agent and CI guidance can affect all contributors:

  ```powershell
  Set-Location BACK
  pnpm exec prettier --check "src/**/*.ts" "test/**/*.ts"
  pnpm exec eslint "{src,test}/**/*.ts"
  pnpm build
  pnpm test --runInBand
  Set-Location ../front
  pnpm exec tsc --noEmit
  pnpm exec eslint .
  pnpm test
  pnpm build
  Set-Location ..
  ```

- [ ] Final repository checks:

  ```powershell
  git diff --check
  git status --short
  git log --oneline --decorate origin/develop..HEAD
  ```

  Expected: clean tree after all intended commits; only coherent workflow commits ahead of `origin/develop`.

### Task 9: Review, publish, open the PR, and merge to `develop`

**Files:**
- Review: `origin/develop...HEAD`
- Create: GitHub pull request metadata

- [ ] Invoke the `code-review` skill against `origin/develop`; run Standards and Spec reviews independently. Correct every blocking finding in a focused commit and repeat Task 8.

- [ ] Push without force:

  ```powershell
  git push -u origin chore/shared/professional-gitflow
  ```

- [ ] Generate the body with the `pr` skill and create the PR against `develop`:

  ```powershell
  $prBodyPath = Join-Path ([System.IO.Path]::GetTempPath()) 'joapycore-professional-gitflow-pr.md'
  gh pr create --base develop --head chore/shared/professional-gitflow --title "chore(workflow): profesionalizar Gitflow y revisión" --body-file $prBodyPath
  ```

- [ ] Confirm both `PR Policy` and functional CI checks pass. Because branch protection is unavailable, treat a green run and explicit review as a mandatory human process control.

- [ ] Merge with a merge commit and delete the branch:

  ```powershell
  gh pr merge --merge --delete-branch
  git switch develop
  git pull --ff-only origin develop
  git status --short --branch
  ```

- [ ] Verify `develop` contains both workflow PR commits and that `main` has not moved:

  ```powershell
  git log --oneline --decorate -8 develop
  git log --oneline --decorate -3 main
  git ls-remote --heads origin develop main
  ```

  Record the two PR URLs, merge commit IDs, checks, remaining GitHub-plan limitation, and the future release procedure. Do not open or merge a PR to `main` as part of this plan.
