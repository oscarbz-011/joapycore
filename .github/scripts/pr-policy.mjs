import { pathToFileURL } from "node:url";

const TITLE_PATTERN =
  /^(?:feat|fix|refactor|perf|docs|test|build|ci|chore|revert)(?:\([a-z0-9][a-z0-9-]*\))?!?:\s+\S(?:.*\S)?$/;
const TOPIC_PATTERN =
  /^(feature|fix|refactor|chore|docs|test|ci)\/(back|front|shared|infra)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const RELEASE_PATTERN = /^release\/(\d+\.\d+\.\d+)$/;
const HOTFIX_PATTERN =
  /^hotfix\/(back|front|shared|infra)\/(\d+\.\d+\.\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const PERMANENT_BRANCHES = new Set(["develop", "main"]);

export function validateTitle(title) {
  if (typeof title === "string" && TITLE_PATTERN.test(title)) {
    return [];
  }

  return [
    "PR title must use Conventional Commit format, for example: feat(sales): add orders.",
  ];
}

export function classifyBranch(head) {
  if (PERMANENT_BRANCHES.has(head)) {
    return { kind: "permanent", name: head };
  }

  const topic = TOPIC_PATTERN.exec(head);
  if (topic) {
    return { kind: "topic", type: topic[1], scope: topic[2], slug: topic[3] };
  }

  const release = RELEASE_PATTERN.exec(head);
  if (release) {
    return { kind: "release", version: release[1] };
  }

  const hotfix = HOTFIX_PATTERN.exec(head);
  if (hotfix) {
    return {
      kind: "hotfix",
      scope: hotfix[1],
      version: hotfix[2],
      slug: hotfix[3],
    };
  }

  return { kind: "invalid", name: head };
}

export function validatePullRequest({ head, base, title }) {
  const errors = [...validateTitle(title)];
  const branch = classifyBranch(head);

  if (branch.kind === "invalid") {
    errors.push(
      "Head ref is not a valid branch name. See CONTRIBUTING.md for the supported lowercase patterns.",
    );
    return errors;
  }

  if (branch.kind === "permanent") {
    errors.push(
      "A permanent branch cannot be used as the PR head; create a release, hotfix, or topic branch.",
    );
    return errors;
  }

  if (branch.kind === "topic" && base !== "develop") {
    errors.push(`Topic branch ${head} must target develop, not ${base}.`);
  }

  if (branch.kind === "release" && base !== "main" && base !== "develop") {
    errors.push(`Release branch ${head} may target only main or develop.`);
  }

  if (branch.kind === "hotfix" && base !== "main" && base !== "develop") {
    errors.push(`Hotfix branch ${head} may target only main or develop.`);
  }

  return errors;
}

function runCli() {
  const errors = validatePullRequest({
    head: process.env.HEAD_REF ?? "",
    base: process.env.BASE_REF ?? "",
    title: process.env.PR_TITLE ?? "",
  });

  if (errors.length === 0) {
    console.log("PR policy passed.");
    return;
  }

  console.error("PR policy rejected this pull request:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (import.meta.url === invokedPath) {
  runCli();
}
