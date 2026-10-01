# Contributing to JoapyCore

This repository uses a two-branch Gitflow. `develop` is the integration branch and `main` is the production branch. Do not push directly to either permanent branch: every change goes through a reviewed pull request with green CI.

## Permanent branches

- `develop`: latest integrated work planned for a future release.
- `main`: code released to production. It receives only release and primary hotfix pull requests.

## Topic branches

| Change | Branch pattern | Start from | Pull request to |
| --- | --- | --- | --- |
| Feature | `feature/<scope>/<ticket>-<slug>` | `develop` | `develop` |
| Bug fix | `fix/<scope>/<ticket>-<slug>` | `develop` | `develop` |
| Refactor | `refactor/<scope>/<ticket>-<slug>` | `develop` | `develop` |
| Maintenance | `chore/<scope>/<ticket>-<slug>` | `develop` | `develop` |
| Documentation | `docs/<scope>/<ticket>-<slug>` | `develop` | `develop` |
| Tests | `test/<scope>/<ticket>-<slug>` | `develop` | `develop` |
| CI | `ci/<scope>/<ticket>-<slug>` | `develop` | `develop` |
| Release | `release/<semver>` | `develop` | `main`, then synchronize to `develop` |
| Production hotfix | `hotfix/<scope>/<semver>-<slug>` | deployed tag on `main` | `main`, then integrate the identical fix into `develop` |

Use the scopes `back`, `front`, `shared`, or `infra`. A ticket is required when one exists in the issue tracker and omitted otherwise; examples without tickets are `fix/front/invoice-retry` and `refactor/shared/events`. Names use lowercase letters, digits, and hyphens only. The attachment that motivated this policy uses older `feat-*` and `bug-*` examples; the patterns in this document are authoritative for JoapyCore.

## Daily development

1. Fetch the remote and create the correct topic branch from an up-to-date base.
2. Keep commits atomic, reversible, and in Conventional Commit format, for example `feat(sales): add order approval`.
3. Stage explicit paths, inspect `git diff --cached`, and keep behavior tests in the same commit as their implementation. Do not add co-author trailers automatically.
4. Run the checks affected by the change with pnpm. Backend changes normally require Prisma generation/validation, formatting, lint, build, unit tests, and applicable integration/e2e tests. Frontend changes normally require TypeScript, lint, tests, and build.
5. Push the topic branch and open a pull request to the destination in the table. Include migrations, tenant-isolation/security impact, risks, rollback, and exact verification results.
6. Resolve every blocking review finding and rerun the relevant checks. Merge with a merge commit so logical commits remain visible, then delete the topic branch.

Never use npm or Yarn in this repository. Never bypass a failing check to merge.

## Updating a topic branch

A private branch owned by one person may be rebased on its base before the pull request is opened. A published/shared branch incorporates the base with a merge commit so other contributors' history is not rewritten. Do not force-push after review begins.

## Releases

1. Create `release/<semver>` from the release-ready `develop` commit.
2. Limit it to release preparation and final fixes; open its pull request to `main`.
3. After review and green CI, merge with a merge commit and create an annotated SemVer tag such as `v1.4.0` on the merge commit.
4. Synchronize the released commit back into `develop` through a reviewed pull request from the release branch before deleting it.

Do not open an ordinary `develop -> main` pull request; the release branch records the version and preparation work explicitly.

## Hotfixes

1. Branch `hotfix/<scope>/<semver>-<slug>` from the tag currently deployed from `main`.
2. Keep the change minimal, test it, and open the primary pull request to `main`.
3. After review and green CI, merge it and create an annotated patch-version tag.
4. Integrate the identical hotfix commit into `develop` through a second reviewed pull request. Resolve conflicts on the hotfix branch; do not reimplement the fix differently.

## Reviews and repository controls

At least one independent code review and all applicable GitHub Actions checks are required before merge. Review against the pull request's actual base, verify the requested behavior and repository standards separately, and leave no known Critical or Important finding unresolved.

The current private-repository GitHub plan does not provide the required branch ruleset. CI detects policy violations but cannot prevent a direct push after it occurs, so the rules above are mandatory process controls. Enable a remote ruleset/branch protection before adding collaborators; require pull requests, successful CI and PR Policy checks, review approval, conversation resolution, and block force-pushes/deletion on `develop` and `main`.
