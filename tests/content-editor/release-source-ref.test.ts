import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const runner = resolve("scripts/release-job.mjs");
const legacyBranch = "fix/dashboard-release-recovery-20261029";
const releaseBranch = "fix/fixture-reviewed-release";

// Use real Git and the real detached runner/wrapper. Only the build, providers
// and HTTP probe are fixtures; no production credentials or external services.
for (const scenario of ["default", "explicit-branch", "branch-advanced", "wrong-branch"] as const) {
  test(`reviewed source ${scenario}: the detached release deploys only the pinned commit`, () => {
    const root = mkdtempSync(join(tmpdir(), "release-source-ref-"));
    const app = join(root, "app"), origin = join(root, "origin.git"), bin = join(root, "bin");
    const record = join(root, "calls"), jobs = join(root, "jobs");
    mkdirSync(join(app, "scripts"), { recursive: true }); mkdirSync(bin);
    const environment = {
      NODE_ENV: "test" as const,
      PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
      GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.test",
      GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.test",
      APP_DIR: app, RELEASE_JOBS_DIR: jobs, RELEASE_BACKUPS_DIR: join(root, "backups"),
      FIXTURE_RECORD: record,
    };
    const git = (...args: string[]) => {
      const result = spawnSync("git", args, { cwd: app, env: environment, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
    };
    const executable = (name: string, body: string) => writeFileSync(join(bin, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
    try {
      executable("curl", 'printf "probe %s\\n" "$*" >> "$FIXTURE_RECORD"');
      for (const name of ["npm", "pm2"]) executable(name, 'echo "Unexpected production tool in release fixture" >&2; exit 91');
      writeFileSync(join(app, "scripts/release-job.mjs"), readFileSync(runner));
      writeFileSync(join(app, "scripts/deploy-reviewed-dashboard.sh"), readFileSync("scripts/deploy-reviewed-dashboard.sh"));
      writeFileSync(join(app, "scripts/deploy-vps.sh"), [
        "#!/bin/bash", "set -euo pipefail", 'cd "$(dirname "$0")/.."',
        '[[ ! -v APP_DIR ]] || { echo "APP_DIR leaked into the build" >&2; exit 92; }',
        '[[ "$BRANCH" == "$FIXTURE_TARGET" ]] || exit 93',
        // Exercise the second fetch too, as the real deploy-vps.sh does.
        'git pull --ff-only origin "$BRANCH"',
        'printf "build %s\\n" "$(git rev-parse HEAD)" >> "$FIXTURE_RECORD"',
        "mv .next .next-previous", "mkdir .next", "cp reviewed-marker .next/runtime",
      ].join("\n"));
      writeFileSync(join(app, "scripts/finalize-reviewed-dashboard.mjs"), 'import {appendFileSync} from "node:fs"; appendFileSync(process.env.FIXTURE_RECORD,"metadata\\n");');
      writeFileSync(join(app, "reviewed-marker"), "old-runtime");
      git("init", "--initial-branch=" + legacyBranch);
      git("add", "."); git("commit", "-m", "Existing runtime on the legacy release branch");
      const previous = git("rev-parse", "HEAD");
      git("init", "--bare", origin); git("remote", "add", "origin", origin);
      git("push", "origin", legacyBranch);
      git("switch", "-c", releaseBranch);
      writeFileSync(join(app, "reviewed-marker"), "reviewed-runtime");
      git("add", "reviewed-marker"); git("commit", "-m", "Reviewed release on a different branch");
      const target = git("rev-parse", "HEAD");
      if (scenario === "branch-advanced") {
        writeFileSync(join(app, "reviewed-marker"), "unreviewed-newer-runtime");
        git("add", "reviewed-marker"); git("commit", "-m", "Newer commit must not replace the reviewed target");
      }
      git("push", "origin", releaseBranch);
      git("switch", "--detach", previous);
      mkdirSync(join(app, ".next")); writeFileSync(join(app, ".next/runtime"), "old-runtime");
      // Bootstrap the pinned runner with the same fetch/show sequence used on
      // the VPS; neither the outer fetch nor the wrapper may follow a new head.
      git("fetch", "origin", target);
      assert.equal(git("rev-parse", "FETCH_HEAD"), target);
      const pinnedRunner = join(root, "reviewed-runner.mjs");
      writeFileSync(pinnedRunner, git("show", target + ":scripts/release-job.mjs"));
      const result = spawnSync(process.execPath, [pinnedRunner, "start", target, "--wait"], {
        cwd: app, encoding: "utf8", timeout: 15_000,
        env: {
          ...environment, FIXTURE_TARGET: target,
          ...(scenario === "explicit-branch" ? { SOURCE_BRANCH: releaseBranch } : {}),
          ...(scenario === "wrong-branch" ? { SOURCE_BRANCH: legacyBranch } : {}),
        },
      });
      assert.equal(result.error, undefined, result.error?.message);
      const job = readFileSync(join(jobs, "latest"), "utf8").trim();
      const state = JSON.parse(readFileSync(join(job, "status.json"), "utf8"));
      const calls = existsSync(record) ? readFileSync(record, "utf8") : "";
      const log = readFileSync(join(job, "release.log"), "utf8");
      assert.equal(state.paymentCaptures, 0); assert.equal(state.recipientMessages, 0);
      assert.equal(git("rev-parse", "refs/remotes/origin/" + legacyBranch), previous);
      if (scenario === "wrong-branch") {
        assert.equal(result.status, 1); assert.equal(state.phase, "FAILED");
        assert.equal(state.failedPhase, "DEPLOYING"); assert.notEqual(state.runtimeActivated, true);
        assert.match(log, /Remote head differs from the reviewed commit/);
        assert.equal(git("rev-parse", "HEAD"), previous);
        assert.equal(readFileSync(join(app, ".next/runtime"), "utf8"), "old-runtime");
        assert.equal(calls, ""); assert.equal(existsSync(join(root, "backups")), false);
      } else {
        assert.equal(result.status, 0, result.stdout + result.stderr + log);
        assert.equal(state.phase, "SUCCEEDED"); assert.equal(state.runtimeActivated, true);
        assert.equal(git("rev-parse", "HEAD"), target);
        assert.equal(readFileSync(join(app, ".next/runtime"), "utf8"), "reviewed-runtime");
        assert.equal(calls.split("\n").filter(line => line === "build " + target).length, 1);
        assert.equal(calls.split("\n").filter(line => line === "metadata").length, 1);
        assert.match(calls, /probe .*api\/global-settings/);
        assert.match(result.stdout, /\[release\] SUCCEEDED/);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
