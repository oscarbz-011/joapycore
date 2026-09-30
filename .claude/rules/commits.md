# Commits

Follow the commit policy in [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

- Use Conventional Commits: `<type>(<optional-scope>)<optional-!>: <subject>`.
- Keep one coherent, testable, reversible purpose per commit.
- Stage explicit paths and inspect `git diff --cached` before committing.
- Include behavior tests with the implementation they verify.
- Do not commit secrets, broken intermediate states, vague WIP messages, or automatic `Co-authored-by` trailers.
- Update project documentation only when the change requires it; do not log every commit in `GC_PENDIENTS.md`.
