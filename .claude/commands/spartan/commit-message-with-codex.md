---
description: Review a staged JoapyCore change with Codex, then propose its Conventional Commit message.
---

# Commit message with Codex

Inspect status and the cached diff first. Require explicit-path staging, a single coherent purpose, no secrets, and applicable green checks. Ask Codex for a read-only review of the staged diff; resolve any Critical or Important finding before continuing.

Then propose the Conventional Commit subject/body under `CONTRIBUTING.md`. Keep an existing ticket reference, omit it when none exists, and never add automatic co-author trailers. Do not commit unless the invoking task authorizes it.
