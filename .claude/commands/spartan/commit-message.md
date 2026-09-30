---
description: Propose a Conventional Commit from an explicitly staged JoapyCore diff.
---

# Commit message

Inspect `git status`, `git diff`, and `git diff --cached`. If nothing is staged, identify the coherent paths/hunks but do not use `git add .` or `git add -A`; stage explicit paths only when authorized.

Reject mixed purposes and secret/generated/build output. Confirm the relevant checks passed. Propose one Conventional Commit subject using the types allowed by `CONTRIBUTING.md`, with an optional concise body explaining why. Preserve an issue/ticket reference when one exists; do not invent one and do not add co-author trailers.
