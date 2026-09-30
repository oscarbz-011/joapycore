# Codex helpers for JoapyCore reviews.
# Source this file from zsh after installing Codex and GitHub CLI.

: "${CDX_BASE:=develop}"
: "${CDX_MODEL:=}"

_cdx_codex() {
  local -a args
  args=(--ask-for-approval never --sandbox read-only)
  [[ -n "$CDX_MODEL" ]] && args+=(-m "$CDX_MODEL")
  codex "${args[@]}" "$@"
}

_cdx_existing_ref() {
  local name="$1"
  if git rev-parse --verify --quiet "origin/$name" >/dev/null; then
    printf 'origin/%s\n' "$name"
  elif git rev-parse --verify --quiet "$name" >/dev/null; then
    printf '%s\n' "$name"
  else
    return 1
  fi
}

_cdx_resolve_base() {
  local requested="$1" branch pr_base
  if [[ -n "$requested" ]]; then
    printf '%s\n' "$requested"
    return
  fi

  if command -v gh >/dev/null; then
    pr_base=$(gh pr view --json baseRefName --jq .baseRefName 2>/dev/null)
    if [[ -n "$pr_base" ]]; then
      _cdx_existing_ref "$pr_base"
      return
    fi
  fi

  branch=$(git branch --show-current 2>/dev/null)
  case "$branch" in
    release/*|hotfix/*)
      _cdx_existing_ref main && return
      ;;
    develop)
      _cdx_existing_ref develop && return
      ;;
    main)
      echo "Refusing to infer a review base on main; pass an explicit release/hotfix base." >&2
      return 1
      ;;
    *)
      _cdx_existing_ref develop && return
      ;;
  esac

  printf '%s\n' "$CDX_BASE"
}

_cdx_review_diff() {
  local base="$1"
  shift
  _cdx_codex review --base "$base" \
    "Review the complete current-branch diff against '$base'. $* Report actionable findings by severity with file:line and a concrete fix."
}

cdx-review() {
  local requested="" base
  if [[ -n "$1" ]] && git rev-parse --verify --quiet "$1" >/dev/null; then
    requested="$1"
    shift
  fi
  base=$(_cdx_resolve_base "$requested") || return
  echo "==> Reviewing against $base"
  _cdx_review_diff "$base" "$*"
}

cdx-security() {
  local base
  base=$(_cdx_resolve_base "$1") || return
  _cdx_review_diff "$base" \
    "Focus on authentication, authorization, tenant isolation, injection, SSRF, secrets, unsafe files, logging, dependency risk, and denial of service."
}

cdx-uncommitted() {
  _cdx_codex review --uncommitted \
    "Review staged, unstaged, and untracked changes. Report only actionable findings."
}

cdx-commit() {
  local sha="$1"
  [[ -z "$sha" ]] && { echo "Usage: cdx-commit <sha>" >&2; return 1; }
  shift
  _cdx_codex review --commit "$sha" "$@"
}

cdx-pr() {
  local pr="$1" meta number base ref tmp status
  [[ -z "$pr" ]] && { echo "Usage: cdx-pr <number-or-url>" >&2; return 1; }
  command -v gh >/dev/null || { echo "gh CLI is required." >&2; return 1; }

  meta=$(gh pr view "$pr" --json number,baseRefName --template '{{.number}} {{.baseRefName}}') || return
  number="${meta%% *}"
  base="${meta#* }"
  ref="refs/remotes/origin/pr-$number"
  git fetch origin "refs/heads/$base:refs/remotes/origin/$base" "pull/$number/head:$ref" --quiet || return
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/cdx-pr-${number}.XXXXXX") || return
  git worktree add --detach "$tmp" "$ref" >/dev/null || return
  (cd "$tmp" && _cdx_review_diff "origin/$base" "Review Standards and Specification separately.")
  status=$?
  git worktree remove "$tmp" --force >/dev/null 2>&1
  return "$status"
}

cdx-help() {
  cat <<'EOF'
Codex helpers (default integration base: develop)

  cdx-review [base] [prompt]  Review current branch against resolved base
  cdx-security [base]         Security and tenant-isolation review
  cdx-uncommitted             Review working-tree changes
  cdx-commit <sha>            Review one commit
  cdx-pr <number-or-url>      Review a PR against its actual base
EOF
}
