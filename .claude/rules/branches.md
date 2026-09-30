# Branches

Follow [`CONTRIBUTING.md`](../../CONTRIBUTING.md) as the single source of truth.

- Start ordinary `feature`, `fix`, `refactor`, `chore`, `docs`, `test`, and `ci` branches from `develop` and open their PRs to `develop`.
- Use `main` only for reviewed `release/<semver>` and primary `hotfix/*` PRs.
- Never push directly to `develop` or `main`, and never force-push after review starts.
- Resolve the comparison base from the open PR when one exists; do not assume `main`.
