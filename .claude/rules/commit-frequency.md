# Commit frequency

Commit after a coherent unit is implemented and its relevant checks pass. Separate unrelated purposes even when they were requested together; keep inseparable implementation and tests together. Do not create artificial commits that leave the branch broken, and do not commit exploratory output that should be discarded.

Before each commit:

1. Inspect `git status` and the unstaged diff.
2. Run the relevant tests, types, lint, formatting, or build checks.
3. Stage only explicit related paths.
4. Inspect `git diff --cached --check` and the cached diff.
5. Commit with the format required by [`CONTRIBUTING.md`](../../CONTRIBUTING.md).
