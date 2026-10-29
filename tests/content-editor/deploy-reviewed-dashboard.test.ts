import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const target = "a".repeat(40), previous = "b".repeat(40);
for (const scenario of ["healthy", "mismatch", "dirty", "build-failed", "rollback", "rollback-dependencies"] as const) {
  test(`reviewed deployment: ${scenario} uses only fixture git, PM2 and HTTP`, () => {
    const root = mkdtempSync(join(tmpdir(), "reviewed-deploy-")), app = join(root, "app"), bin = join(root, "bin"), log = join(root, "calls");
    mkdirSync(join(app, "scripts"), { recursive: true }); mkdirSync(bin); mkdirSync(join(app, ".next")); mkdirSync(join(app, "node_modules"));
    writeFileSync(join(app, ".next", "version"), "old-build"); writeFileSync(join(app, "node_modules", "version"), "old-dependencies");
    writeFileSync(join(app, "scripts", "deploy-reviewed-dashboard.sh"), readFileSync("scripts/deploy-reviewed-dashboard.sh"));
    const executable = (name: string, contents: string) => writeFileSync(join(bin, name), "#!/bin/bash\n" + contents, { mode: 0o755 });
    executable("git", [
      'if [[ "$PWD" != "$FIXTURE_APP" ]]; then echo "Git escaped the fixture" >&2; exit 90; fi',
      'printf "git %s\\n" "$*" >> "$FIXTURE_LOG"',
      'if [[ "$1" == diff && "$SCENARIO" == dirty ]]; then exit 1; fi',
      `if [[ "$1" == rev-parse ]]; then if [[ "$2" == FETCH_HEAD && "$SCENARIO" != mismatch ]]; then printf '${target}'; else printf '${previous}'; fi; fi`,
      "exit 0",
    ].join("\n"));
    executable("curl", 'printf "curl\\n" >> "$FIXTURE_LOG"\n[[ "$SCENARIO" != rollback* ]]');
    executable("sleep", "exit 0"); executable("pm2", 'printf "pm2 %s\\n" "$*" >> "$FIXTURE_LOG"');
    executable("npm", 'echo "Unexpected npm call inside deployment fixture" >&2; exit 91');
    writeFileSync(join(app, "scripts", "deploy-vps.sh"), [
      '#!/bin/bash',
      '[[ -v APP_DIR ]] && { echo "APP_DIR leaked into the build" >&2; exit 92; }',
      '[[ -v DATABASE_URL || -v NEXT_DIST_DIR ]] && { echo "Production environment leaked into the fixture" >&2; exit 93; }',
      'printf "deploy %s\\n" "$BRANCH" >> "$FIXTURE_LOG"',
      '[[ "$SCENARIO" == build-failed ]] && exit 31',
      'mv .next .next-previous', 'mkdir .next', 'echo new-build > .next/version',
      'if [[ "$SCENARIO" == rollback-dependencies ]]; then echo "▶ activating lockfile-matched dependencies"; mv node_modules .node_modules-previous; mkdir node_modules; echo new-dependencies > node_modules/version; fi',
      'exit 0',
    ].join("\n"));
    try {
      const result = spawnSync("bash", [join(app, "scripts", "deploy-reviewed-dashboard.sh"), target], {
        cwd: app, encoding: "utf8", timeout: 10_000,
        // Do not inherit the real APP_DIR, credentials, dist dir or PM2 settings.
        // Explicitly set APP_DIR to the fixture to exercise the wrapper entry point.
        env: { NODE_ENV: "test", PATH: `${bin}:/usr/bin:/bin`, APP_DIR: app, SCENARIO: scenario, FIXTURE_LOG: log, FIXTURE_APP: app, RELEASE_BACKUPS_DIR: join(root, "backups") },
      });
      assert.equal(result.error, undefined, result.error?.message);
      const calls = readFileSync(log, "utf8");
      if (scenario === "healthy") { assert.equal(result.status, 0, result.stdout + result.stderr); assert.equal(readFileSync(join(app, ".next", "version"), "utf8").trim(), "new-build"); assert.match(calls, /curl/); }
      else {
        assert.notEqual(result.status, 0); assert.equal(readFileSync(join(app, ".next", "version"), "utf8").trim(), "old-build");
        if (scenario.startsWith("rollback")) {
          assert.match(calls, new RegExp(`git switch --detach ${previous}`)); assert.match(calls, /pm2 restart minberiaksa --update-env/);
          assert.equal(readFileSync(join(app, "node_modules", "version"), "utf8").trim(), "old-dependencies");
        } else if (scenario !== "build-failed") { assert.equal(calls.includes("deploy "), false); assert.equal(existsSync(join(root, "backups")), false); }
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
