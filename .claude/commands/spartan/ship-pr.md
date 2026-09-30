---
description: Publish, review, and merge a verified JoapyCore topic branch through the professional Gitflow.
---

# Ship PR

1. Resolve the destination with `.claude/rules/branches.md`; ordinary work targets `develop`, release/primary hotfix work targets `main`, and back-merges target `develop`.
2. Require a clean branch, atomic Conventional Commits, completed `/spartan:pr-ready`, and no unresolved Critical/Important review finding.
3. Push the named branch without force. Create the PR using its resolved base and `.github/pull_request_template.md`.
4. Wait for PR Policy and functional CI. Diagnose failures and add focused commits; never bypass checks.
5. Merge with a merge commit, delete the remote topic branch, fetch/prune, and verify the destination ref advanced while the other permanent branch did not move unexpectedly.
6. For releases/hotfixes, apply the annotated SemVer tag and required synchronization only when that explicit operation is in scope.
