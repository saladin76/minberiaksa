#!/usr/bin/env bash
# READ-ONLY VPS runtime reconnaissance. NO git pull/build/PM2 reload/DB query.
# Run as an authorized VPS operator. Do not post entire env/config/log files.
set -Eeuo pipefail
printf 'CHECK=VPS_RUNTIME_READ_ONLY\nUTC=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
command -v node >/dev/null 2>&1 || { echo 'NODE_CLI=UNAVAILABLE'; exit 1; }
printf 'SHELL_NODE_VERSION=%s\n' "$(node -v)"
if command -v pm2 >/dev/null 2>&1; then
  if ! pm2 jlist 2>/dev/null | node -e '
    let data="";process.stdin.on("data",c=>data+=c);
    process.stdin.on("end",()=>{try {
      const list=JSON.parse(data);
      for(const p of list.filter(x=>/minber/i.test(String(x.name||"")))){
        const e=p.pm2_env||{};
        const f={name:p.name,pid:p.pid,status:e.status,cwd:e.pm_cwd??"unknown",
          script:e.pm_exec_path??"unknown",interpreter:e.exec_interpreter??"unknown",
          port:/^[0-9]{2,5}$/.test(String(e.PORT??""))?String(e.PORT):"unknown",
          restarts:e.restart_time??null};
        process.stdout.write("PM2_RUNTIME="+JSON.stringify(f)+"\n");
      }
    }catch{process.stdout.write("PM2_RUNTIME=UNAVAILABLE\n");process.exitCode=1;}});
  '; then echo 'PM2_INSPECTION=INCOMPLETE'; fi
else
  echo 'PM2_CLI=UNAVAILABLE'
fi
if command -v nginx >/dev/null 2>&1; then
  if nginx -t -q >/dev/null 2>&1; then echo 'NGINX_CONFIG_TEST=PASS'; else echo 'NGINX_CONFIG_TEST=FAILED_OR_UNAUTHORIZED'; fi
else
  echo 'NGINX_CLI=UNAVAILABLE'
fi
if command -v ss >/dev/null 2>&1; then
  # Numeric listener list only: no credentials or request data.
  ss -ltnH 2>/dev/null | awk '{print $4}' | sed -E 's/^.*:([0-9]+)$/\1/' | grep -E '^[0-9]+$' | sort -nu | tr '\n' ',' | awk '{print "LISTEN_PORTS="$0}'
fi
if command -v crontab >/dev/null 2>&1; then
  count="$(crontab -l 2>/dev/null | grep -c 'vps-cron-run.sh' || true)"
  printf 'MINBER_CRON_ENTRIES=%s\n' "$count"
fi
for root in /root/minber-staging /opt/minber-staging /srv/minber-staging; do
  if test -d "$root"; then
    printf 'STAGING_DIRECTORY_EXISTS=YES\n'
  fi
done
printf 'MEM_AVAILABLE_MIB=%s\n' "$(awk '/MemAvailable:/ {printf "%d", $2/1024}' /proc/meminfo)"
printf 'FREE_DISK_MIB=%s\n' "$(df -Pm / | awk 'NR==2{print $4}')"
printf 'ACTIVE_BUILD_SHA=NOT_VERIFIED_REQUIRES_AUTHENTICATED_BUILD_INFO\n'
printf 'NGINX_TO_PM2_MAPPING=NOT_VERIFIED_REQUIRES_REVIEWED_CONFIG\n'
printf 'DATABASE_IDENTITY=NOT_READ_NO_CREDENTIALS_DISCLOSED\n'
printf 'DATABASE_WRITES=0\nPAYMENT_CALLS=0\nSERVICES_CHANGED=0\n'
