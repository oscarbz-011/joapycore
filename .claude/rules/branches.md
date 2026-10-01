# Branches

Follow [`CONTRIBUTING.md`](../../CONTRIBUTING.md) as the single source of truth.

- Start ordinary `feature`, `fix`, `refactor`, `chore`, `docs`, `test`, and `ci` branches from `develop` and open their PRs to `develop`.
- Use `main` only for reviewed `release/<semver>` and primary `hotfix/*` PRs.
- Never push directly to `develop` or `main`, and never force-push after review starts.
- Resolve the comparison base with this single algorithm:
  1. Use the actual base of an open PR when one exists.
  2. Use `main` for a `release/*` branch or the primary PR of a `hotfix/*` branch.
  3. Use `develop` for ordinary topic branches and hotfix/release back-merges.
  4. On `develop`, compare with `origin/develop` only for synchronization; never open a PR to itself.
  5. On `main`, stop unless the task explicitly verifies a release or hotfix.
