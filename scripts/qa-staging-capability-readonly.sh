#!/usr/bin/env bash
# READ-ONLY reconnaissance for a future isolated MongoDB+Next staging rehearsal.
# It NEVER starts Docker/mongod, touches a database, reads credential values,
# calls payments, modifies services, deploys, installs or pulls anything.
set -Eeuo pipefail
ROOT=/root/minberiaksa
die(){ printf 'BLOCKED: %s\n' "$*" >&2; exit 1; }
test -d "$ROOT/.git" || test -f "$ROOT/.git" || die "Minber source checkout not found"
command -v node >/dev/null 2>&1 || die "Node.js unavailable"
cd "$ROOT"
before=$(git rev-parse HEAD)
printf 'CHECK=STAGING_CAPABILITY_READ_ONLY\n'
printf 'PRODUCTION_CHECKOUT_SHA=%s\n' "$before"
printf 'PRODUCTION_CHECKOUT_CHANGED=NO\n'
printf 'UTC_TIME=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
printf 'NODE_MAJOR=%s\n' "$(node -p 'process.versions.node.split(".")[0]')"
if command -v docker >/dev/null 2>&1; then
  printf 'DOCKER_CLI=YES\n'
  if command -v timeout >/dev/null 2>&1 && timeout 6s docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
    printf 'DOCKER_DAEMON=AVAILABLE\n'
    if docker image inspect mongo:7.0 >/dev/null 2>&1; then
      printf 'MONGO_7_IMAGE_ALREADY_CACHED=YES\n'
    else
      printf 'MONGO_7_IMAGE_ALREADY_CACHED=NO\n'
    fi
  else
    printf 'DOCKER_DAEMON=UNAVAILABLE\n'
    printf 'MONGO_7_IMAGE_ALREADY_CACHED=UNKNOWN\n'
  fi
else
  printf 'DOCKER_CLI=NO\nDOCKER_DAEMON=UNAVAILABLE\nMONGO_7_IMAGE_ALREADY_CACHED=UNKNOWN\n'
fi
if command -v mongod >/dev/null 2>&1; then
  printf 'MONGOD_BINARY=AVAILABLE\n'
else
  printf 'MONGOD_BINARY=UNAVAILABLE\n'
fi
if command -v mongosh >/dev/null 2>&1; then
  printf 'MONGOSH_BINARY=AVAILABLE\n'
else
  printf 'MONGOSH_BINARY=UNAVAILABLE\n'
fi
if [ -d /root/minber-media-recovery/translation-seo-browser-qa/browsers ]; then
  printf 'ISOLATED_CHROMIUM_CACHE=YES\n'
else
  printf 'ISOLATED_CHROMIUM_CACHE=NO\n'
fi
# Existence tests only. Do not source, cat, grep, or print staging or live ENV.
for candidate in /root/minber-staging /opt/minber-staging /srv/minber-staging /root/minber-media-recovery/staging; do
  if [ -d "$candidate" ]; then
    case "$candidate" in
      /root/minber-staging) label=ROOT ;;
      /opt/minber-staging) label=OPT ;;
      /srv/minber-staging) label=SRV ;;
      *) label=RECOVERY ;;
    esac
    printf 'EXISTING_STAGING_DIR_%s=YES\n' "$label"
  fi
done
# This check intentionally does not inspect database credentials or try a
# connection. A staging URL by itself does not prove DB isolation.
if [ -n "$(printenv QA_STAGING_BASE_URL || true)" ]; then
  if node -e '
    const raw = process.env.QA_STAGING_BASE_URL;
    try {
      const u = new URL(raw);
      const h = u.hostname.toLowerCase().replace(/\.$/, "");
      if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || u.search || u.hash) process.exit(1);
      if (["minberiaksa.org", "www.minberiaksa.org", "176.53.96.235"].includes(h)) process.exit(1);
      if (u.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(h)) process.exit(1);
      if (u.pathname !== "/" || u.port === "3000") process.exit(1);
    } catch { process.exit(1); }
  '; then
    printf 'OPTIONAL_STAGING_URL_SHAPE=ACCEPTED_NOT_PROBED\n'
  else
    printf 'OPTIONAL_STAGING_URL_SHAPE=REJECTED\n'
  fi
else
  printf 'OPTIONAL_STAGING_URL_SHAPE=NOT_SUPPLIED\n'
fi
# Read-only snapshot for scheduling a resource-limited acceptance rehearsal.
printf 'MEM_AVAILABLE_MIB=%s\n' "$(awk '/MemAvailable:/ { printf "%d", $2/1024 }' /proc/meminfo)"
printf 'FREE_DISK_MIB=%s\n' "$(df -Pm /root | awk 'NR==2 {print $4}')"
test "$(git rev-parse HEAD)" = "$before" || die "Production checkout SHA changed while inspecting"
printf 'DATABASE_CONNECTIONS_ATTEMPTED=0\n'
printf 'DATABASE_WRITES=0\n'
printf 'PRODUCTION_SERVICES_CHANGED=NO\n'
printf 'STAGING_CAPABILITY_RESULT=DISCOVERY_ONLY_NO_MERGE_NO_DEPLOY\n'
