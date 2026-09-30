import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyBranch,
  validatePullRequest,
  validateTitle,
} from "./pr-policy.mjs";

const validCases = [
  ["feature/back/123-orders", "develop", "feat(sales): add orders"],
  ["fix/front/invoice-retry", "develop", "fix(billing): retry PDF"],
  ["refactor/shared/events", "develop", "refactor(events): simplify outbox"],
  ["chore/infra/ci-policy", "develop", "ci(workflow): validate PRs"],
  ["release/1.4.0", "main", "chore(release): 1.4.0"],
  ["hotfix/back/1.4.1-invoice", "main", "fix(billing): recover invoices"],
  ["hotfix/back/1.4.1-invoice", "develop", "fix(billing): recover invoices"],
  ["release/1.4.0", "develop", "chore(release): synchronize 1.4.0"],
];

for (const [head, base, title] of validCases) {
  test(`allows ${head} -> ${base}`, () => {
    assert.deepEqual(validatePullRequest({ head, base, title }), []);
  });
}

const invalidCases = [
  {
    head: "feature/back/orders",
    base: "main",
    title: "feat(sales): add orders",
    error: /must target develop/i,
  },
  {
    head: "release/1.4",
    base: "main",
    title: "chore(release): 1.4",
    error: /valid branch name/i,
  },
  {
    head: "develop",
    base: "main",
    title: "chore(release): 1.4.0",
    error: /permanent branch/i,
  },
  {
    head: "feature/Back/orders",
    base: "develop",
    title: "feat(sales): add orders",
    error: /valid branch name/i,
  },
  {
    head: "feature/back/order_retry",
    base: "develop",
    title: "feat(sales): add orders",
    error: /valid branch name/i,
  },
  {
    head: "fix/front/invoice-retry",
    base: "develop",
    title: "retry invoice PDF",
    error: /Conventional Commit/i,
  },
];

for (const { head, base, title, error } of invalidCases) {
  test(`rejects ${head} -> ${base}: ${title}`, () => {
    const errors = validatePullRequest({ head, base, title });
    assert.ok(errors.some((message) => error.test(message)), errors.join("\n"));
  });
}

test("validates Conventional Commit titles", () => {
  assert.deepEqual(validateTitle("fix: x"), []);
  assert.deepEqual(validateTitle("feat!: remove obsolete API"), []);
  assert.deepEqual(validateTitle("perf(database)!: avoid duplicate query"), []);
  assert.match(validateTitle("feature: invalid type")[0], /Conventional Commit/i);
  assert.match(validateTitle("fix(scope):")[0], /Conventional Commit/i);
});

test("classifies supported branch families", () => {
  assert.equal(classifyBranch("docs/shared/contributing").kind, "topic");
  assert.equal(classifyBranch("release/2.0.0").kind, "release");
  assert.equal(classifyBranch("hotfix/back/2.0.1-smtp").kind, "hotfix");
  assert.equal(classifyBranch("develop").kind, "permanent");
  assert.equal(classifyBranch("other/back/change").kind, "invalid");
});
