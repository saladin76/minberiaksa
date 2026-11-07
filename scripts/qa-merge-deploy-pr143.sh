#!/usr/bin/env bash
# Single gated operation for Minber Al Aqsa PR #143.
# All GitHub Actions release gates must pass for the EXACT reviewed head.
# Merge is subject to GitHub branch protection, then the production VPS
# uses its existing release-job runner and rollback checks.
set -Eeuo pipefail
REPO="saladin76/minberiaksa"
PR="143"
SOURCE="ops/drive-media-recovery-20261107"
ROOT="/root/minberiaksa"
die(){ printf 'STOP: %s\n' "$*" >&2; exit 1; }
step(){ printf '\n=== %s ===\n' "$*"; }

command -v gh >/dev/null || die "gh CLI missing. No changes made."
command -v jq >/dev/null || die "jq missing. No changes made."
command -v node >/dev/null || die "Node missing. No changes made."
gh auth status -h github.com >/dev/null 2>&1 || die "gh CLI has no authenticated GitHub account with repository permissions. No changes made."
cd "$ROOT" || die "Production checkout unavailable."
test -f scripts/release-job.mjs && test -d .git || die "Not the approved VPS checkout."
test -z "$(git diff --name-only)" && test -z "$(git diff --cached --name-only)" || die "Tracked local changes; no merge/deploy."
node -e 'if(Number(process.versions.node.split(".")[0])!==24)process.exit(1)' || die "Node 24 required."

step "Verify PR head, base and live checkout"
git fetch --no-tags origin main "$SOURCE" || die "Cannot fetch upstream refs."
head_sha=$(git rev-parse "origin/$SOURCE")
main_sha=$(git rev-parse origin/main)
test "$(git rev-parse HEAD)" = "$main_sha" || die "Live checkout is not at current main."
pr_json=$(gh api "repos/$REPO/pulls/$PR") || die "Cannot inspect PR."
test "$(jq -r '.state' <<< "$pr_json")" = "open" || die "PR is not open."
test "$(jq -r '.head.ref' <<< "$pr_json")" = "$SOURCE" || die "Unexpected PR source."
test "$(jq -r '.head.sha' <<< "$pr_json")" = "$head_sha" || die "PR head differs from fetched commit."
test "$(jq -r '.base.ref' <<< "$pr_json")" = "main" || die "Unexpected PR destination."
test "$(jq -r '.base.sha' <<< "$pr_json")" = "$main_sha" || die "PR base differs from main."
test "$(jq -r '.mergeable' <<< "$pr_json")" = "true" || die "PR has merge conflicts or is not mergeable."
printf 'PR_HEAD=%s\nMAIN_BASE=%s\n' "$head_sha" "$main_sha"

step "Wait for exact HEAD Release gates (stop on failure)"
pass=0
for ((i=1;i<=90;i++)); do
  runs=$(gh api -X GET "repos/$REPO/actions/runs" -f branch="$SOURCE" -f per_page=100) || die "GitHub Actions cannot be inspected."
  row=$(jq -r --arg sha "$head_sha" '[.workflow_runs[] | select(.head_sha==$sha and .event=="pull_request" and .name=="Release gates")] | sort_by(.run_number) | last // empty | [.id,.status,(.conclusion//"")] | @tsv' <<< "$runs")
  if [[ -n "$row" ]]; then
    IFS=$'\t' read -r run_id run_status run_result <<< "$row"
    printf 'CI: run=%s status=%s conclusion=%s\n' "$run_id" "$run_status" "$run_result"
    if [[ "$run_status" == "completed" ]]; then
      if [[ "$run_result" == "success" ]]; then pass=1; break; fi
      die "Release gates failed: https://github.com/$REPO/actions/runs/$run_id . No merge/deploy."
    fi
  else
    echo "CI: waiting for a Release gates run on the exact PR HEAD"
  fi
  if ((i<90)); then sleep 15; fi
done
((pass==1)) || die "GitHub checks did not finish successfully. Nothing merged/deployed."

step "Recheck PR and refs immediately before merge"
git fetch --no-tags origin main "$SOURCE" || die "Cannot refresh upstream refs."
test "$(git rev-parse origin/main)" = "$main_sha" || die "main advanced since validation."
test "$(git rev-parse "origin/$SOURCE")" = "$head_sha" || die "PR head advanced since validation."
test "$(git rev-parse HEAD)" = "$main_sha" || die "Local production source changed."
pr_json=$(gh api "repos/$REPO/pulls/$PR") || die "Cannot inspect PR before merge."
test "$(jq -r '.head.sha' <<< "$pr_json")" = "$head_sha" || die "PR head changed."
test "$(jq -r '.base.sha' <<< "$pr_json")" = "$main_sha" || die "PR base changed."
test "$(jq -r '.mergeable' <<< "$pr_json")" = "true" || die "Mergeability no longer confirmed."
if [[ "$(jq -r '.draft' <<< "$pr_json")" == "true" ]]; then
  gh pr ready "$PR" --repo "$REPO" || die "Cannot mark PR ready."
fi

step "Merge in GitHub with branch protections enforced"
gh pr merge "$PR" --repo "$REPO" --merge --match-head-commit "$head_sha" || die "Merge rejected; no deployment."
merged_pr=$(gh api "repos/$REPO/pulls/$PR") || die "Cannot verify merge; no deployment."
test "$(jq -r '.merged' <<< "$merged_pr")" = "true" || die "GitHub merge not confirmed."
merge_sha=$(jq -r '.merge_commit_sha' <<< "$merged_pr")
[[ "$merge_sha" =~ ^[a-f0-9]{40}$ ]] || die "Invalid merge commit."
printf 'MERGED_SHA=%s\n' "$merge_sha"

step "Verify merged source matches reviewed code"
git fetch --no-tags origin main || die "Merge succeeded; fetch failed; no deployment."
test "$(git rev-parse origin/main)" = "$merge_sha" || die "main changed after merge; no deployment."
git merge-base --is-ancestor "$head_sha" "$merge_sha" || die "Reviewed PR HEAD not contained in merged commit."
test "$(git rev-parse HEAD)" = "$main_sha" || die "Production working tree changed."
test -z "$(git diff --name-only)" && test -z "$(git diff --cached --name-only)" || die "Tracked modifications appeared; no deployment."

step "Publish with existing rollback-aware VPS runner"
# Do not pass --publish/--activate-approved: those flags may trigger
# messaging/template publication unrelated to the image fix.
node scripts/release-job.mjs start "$merge_sha" --wait || die "Merged, but release failed. Inspect release-job logs before any retry."
test "$(git rev-parse HEAD)" = "$merge_sha" || die "Release reported success but HEAD does not match merged SHA."
curl --noproxy '*' --fail --silent --show-error --max-time 10 http://localhost:3000/api/global-settings >/dev/null ||
curl --noproxy '*' --fail --silent --show-error --max-time 10 'http://[::1]:3000/api/global-settings' >/dev/null ||
die "Live health endpoint did not respond; inspect runtime."
printf '\nRELEASE_SUCCEEDED PR=%s SHA=%s\n' "$PR" "$merge_sha"
