---
description: Review frontend changes against the real PR base and JoapyCore Next.js standards.
---

# Frontend review

Resolve the base with `.claude/rules/branches.md`; prefer the open PR's actual base. Review `base...HEAD` plus intentional uncommitted changes only.

Check correctness, Next.js server/client boundaries, TypeScript contracts, API/error handling, permissions, accessibility, responsive states, cache updates, security, tests, and adherence to `.claude/rules/frontend-react/FRONTEND.md`. Run focused checks when needed using pnpm from `front/`.

Report only actionable findings, ordered Critical, Important, Minor, each with `file:line`, impact, and a concrete fix. State explicitly when no blocking finding exists.
