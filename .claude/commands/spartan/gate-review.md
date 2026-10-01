---
description: Run independent standards and specification reviews before a JoapyCore PR.
---

# Gate review

Resolve the comparison base using `.claude/rules/branches.md` and inspect `base...HEAD`.

Run two independent passes:

1. Standards: project rules, correctness, security, tenant isolation, maintainability, tests, and operational safety.
2. Specification: whether the diff fully implements the originating requirement without unrelated behavior.

Classify findings as Critical, Important, or Minor with `file:line` evidence. Fix every Critical and Important item in focused commits, rerun applicable pnpm checks, then repeat both passes. Do not declare the gate passed from self-review alone when an independent reviewer is available.
