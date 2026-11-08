#!/usr/bin/env bash
# Temporary localhost MongoDB acceptance test. No production credentials.
set -Eeuo pipefail
ROOT=/root/minberiaksa
QA_ROOT=/root/minber-media-recovery/translation-seo-mongo-qa
BRANCH="fix/translation-seo-release-gates-20261107"
die(){ printf 'BLOCKED: %s\n' "$*" >&2; exit 1; }
test -d "$ROOT/.git" || die "Production checkout absent"
test -d "$ROOT/node_modules" && test ! -L "$ROOT/node_modules" || die "Safe source dependencies missing"
if test -r /root/.nvm/nvm.sh; then
  export NVM_DIR=/root/.nvm
  . "$NVM_DIR/nvm.sh"
  nvm use 24 >/dev/null || die "Node 24 unavailable"
fi
node -e 'if(Number(process.versions.node.split(".")[0])!==24)process.exit(1)' || die "Node 24 required"
# MongoDB 5.0+ requires AVX on x86_64; do not download/start a binary
# which this production host cannot execute (SIGILL).
if [ "$(uname -m)" = "x86_64" ] && ! grep -qm1 -w avx /proc/cpuinfo; then
  echo "BLOCKED_MONGODB_CPU_AVX_UNAVAILABLE=YES"
  echo "QA_RESULT=BLOCKED_CPU_USE_GITHUB_RUNNER_NO_MERGE_NO_DEPLOY"
  exit 2
fi
cd "$ROOT"
original=$(git rev-parse HEAD)
git fetch --no-tags origin "$BRANCH" || die "Cannot fetch QA branch"
sha=$(git rev-parse FETCH_HEAD)
short=$(printf "%s" "$sha" | cut -c1-12)
work="$QA_ROOT/worktrees/$short"
reports="$QA_ROOT/reports/$short"
mkdir -p "$QA_ROOT/worktrees" "$reports" "$QA_ROOT/tools" "$QA_ROOT/binaries" "$QA_ROOT/npm-cache"
# Ensure redirection targets exist before npm logs or acceptance logs are opened.
test -d "$reports" || die "Could not create this revision\x27s report directory"
if [ ! -d "$work" ]; then
  git worktree add --detach "$work" "$sha" || die "Cannot create isolated worktree"
fi
test "$(git -C "$work" rev-parse HEAD)" = "$sha" || die "Wrong QA revision"
for secret in .env .env.local .env.production .env.production.local; do
  test ! -e "$work/$secret" || die "Unexpected credential file in QA worktree"
done
if [ -L "$work/node_modules" ]; then rm -- "$work/node_modules"; fi
if [ ! -d "$work/node_modules" ]; then
  cp -a --reflink=auto -- "$ROOT/node_modules" "$work/node_modules" || die "Cannot isolate dependencies"
fi
test ! -L "$work/node_modules" || die "QA dependencies must not link to production"
printf 'MONGO_QA_SHA=%s\nWORKTREE=%s\nREPORTS=%s\n' "$sha" "$work" "$reports"
tool="$QA_ROOT/tools"
if [ ! -d "$tool/node_modules/mongodb-memory-server-core" ]; then
  printf 'PREPARE temporary MongoDB binary manager (QA dir only)\n'
  if (cd "$tool" && env -i HOME=/root PATH="$PATH" npm_config_cache="$QA_ROOT/npm-cache" \
    npm_config_update_notifier=false npm_config_ignore_scripts=true \
    npm install --no-save --ignore-scripts --no-audit --no-fund --prefix "$tool" mongodb-memory-server-core@10.4.1 \
    > "$reports/npm-tools.log" 2>&1); then
    printf 'PASS qa-mongo-manager\n'
  else
    printf 'BLOCKED qa-mongo-manager (private npm install) - %s\n' "$reports/npm-tools.log"
    tail -n 12 "$reports/npm-tools.log" || true
    exit 1
  fi
else
  printf 'PASS qa-mongo-manager-already-cached\n'
fi
printf '{"private":true,"type":"commonjs"}\n' > "$tool/package.json"
printf '\nRUN real Prisma MongoDB acceptance rehearsal\n'
if (cd "$work" && env -i \
  HOME=/root PATH="$PATH" NODE_ENV=test NODE_OPTIONS=--max-old-space-size=4096 \
  QA_MONGO_ROOT="$QA_ROOT" MONGOMS_DOWNLOAD_DIR="$QA_ROOT/binaries" \
  MONGOMS_VERSION=8.0.28 MONGOMS_DISABLE_POSTINSTALL=1 \
  DATABASE_URL='mongodb://127.0.0.1:27018/minber_qa_unreachable?serverSelectionTimeoutMS=500&connectTimeoutMS=500' \
  GOOGLE_CLIENT_ID=fixture-client GOOGLE_CLIENT_SECRET=fixture-secret \
  NEXTAUTH_SECRET=fixture-auth-secret NEXTAUTH_URL=http://127.0.0.1:3106 \
  ./node_modules/.bin/tsx scripts/qa-translation-seo-mongo-rehearsal.mjs \
  > "$reports/mongo-acceptance.log" 2>&1); then
  cat "$reports/mongo-acceptance.log"
  test "$(git -C "$ROOT" rev-parse HEAD)" = "$original" || die "Production checkout changed"
  echo 'PRODUCTION_CHECKOUT_UNCHANGED=YES'
  echo 'QA_RESULT=PASSED_ISOLATED_MONGO_NO_PUBLIC_STAGING'
else
  tail -n 38 "$reports/mongo-acceptance.log" || true
  printf 'REPORTS=%s\nQA_RESULT=FAILED_NO_MERGE_NO_DEPLOY\n' "$reports"
  exit 1
fi
