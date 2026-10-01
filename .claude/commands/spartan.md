---
name: spartan
description: Route JoapyCore work to the appropriate professional workflow.
---

# JoapyCore Spartan router

Read `.claude/CLAUDE.md`, `.spartan/config.yaml`, and `CONTRIBUTING.md`, respond in the user's language, and route by intent:

- New behavior or refactor → `/spartan:build`
- Broken behavior → `/spartan:debug`
- Backend/cross-cutting review → `/spartan:review`
- Frontend review → `/spartan:fe-review`
- Independent pre-PR gate → `/spartan:gate-review`
- Commit wording → `/spartan:commit-message`
- PR preparation → `/spartan:pr-ready`
- Publish/merge after approval → `/spartan:ship-pr`

Do not route current JoapyCore work to Kotlin, Micronaut, Gradle, Exposed, or Flyway commands. Use the open PR's actual base when available and the algorithm in `.claude/rules/branches.md` otherwise. Do not assume a ticket exists. Prefer direct handling for explanations and very small read-only tasks.
