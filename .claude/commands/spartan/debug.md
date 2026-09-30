---
description: Diagnose and fix a JoapyCore bug with reproduction, root-cause evidence, regression tests, and review.
---

# Debug

1. Reproduce the symptom and capture the smallest failing command or test before changing code.
2. Trace data and control flow until the root cause is demonstrated; do not patch a guessed cause.
3. Use `fix/<scope>/<ticket>-<slug>` from `develop` for ordinary defects. Use a `hotfix/*` branch from the deployed `main` tag only for an actual production emergency.
4. Add a failing regression test, implement the smallest fix, and rerun neighboring tests.
5. Run the affected workspace's type, lint, build, unit, and applicable integration/e2e checks with pnpm.
6. Stage only related paths, commit atomically, review against the base algorithm in `.claude/rules/branches.md`, and prepare a PR under `CONTRIBUTING.md`.
