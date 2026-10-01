---
description: Ship a JoapyCore PR after independent multi-pass Codex review against its real base.
---

# Ship PR with Codex

Resolve the base with `.claude/rules/branches.md`. Ask Codex for separate read-only Standards and Specification reviews of `base...HEAD`; a second pass must challenge assumptions, tenant boundaries, failure paths, races, and missing tests.

Fix all Critical and Important findings in focused commits, rerun the applicable pnpm checks, and repeat review until both passes are clear. Then follow `/spartan:ship-pr`: push without force, create the PR to the resolved base, wait for PR Policy and CI, merge with a merge commit, delete the topic branch, and verify permanent refs.
