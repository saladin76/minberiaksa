import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
const exec = promisify(execFile);

for (const mode of ["production", "production-local", "inherited", "missing", "nvm"] as const) {
  test(`cron loads Next production configuration: ${mode}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "cron-env-"));
    let requests = 0;
    const expected = mode === "inherited" ? "inherited-fixture" : mode === "production-local" ? "local-fixture" : "production-fixture";
    const server = http.createServer((request, response) => {
      requests++;
      response.writeHead(request.headers.authorization === `Bearer ${expected}` ? 200 : 401);
      response.end("fixture");
    });
    try {
      await mkdir(join(dir, "scripts"));
      await mkdir(join(dir, "node_modules/@next"), { recursive: true });
      await symlink(dirname(require.resolve("@next/env/package.json")), join(dir, "node_modules/@next/env"), "dir");
      const script = join(dir, "scripts/vps-cron-run.sh");
      await copyFile("scripts/vps-cron-run.sh", script);
      if (mode !== "missing") {
        await writeFile(join(dir, ".env"), 'CRON_SECRET="wrong-base-fixture"\n');
        await writeFile(join(dir, ".env.production"), 'CRON_SECRET="production-$CRON_TEST_SUFFIX"\n');
        if (mode === "production-local") await writeFile(join(dir, ".env.production.local"), 'CRON_SECRET="local-fixture"\n');
      }
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", CRON_TEST_SUFFIX: "fixture", CRON_LOG: join(dir, "cron.log"), CRON_BASE_URL: `http://127.0.0.1:${(server.address() as {port: number}).port}` };
      delete env.CRON_SECRET;
      if (mode === "inherited") env.CRON_SECRET = expected;
      if (mode === "nvm") {
        const bin = join(dir, "bin");
        const nodeDir = join(dir, ".nvm/versions/node/v24.fixture/bin");
        await mkdir(bin); await mkdir(nodeDir, { recursive: true });
        await symlink(process.execPath, join(nodeDir, "node"));
        for (const tool of ["dirname", "date", "stat", "flock", "mktemp", "curl", "rm", "head", "tr", "env"]) await symlink("/usr/bin/" + tool, join(bin, tool));
        env.PATH = bin; env.HOME = dir;
      }
      const run = exec("/bin/bash", [script, "/api/cron/fixture-env-" + mode], { env });
      if (mode === "missing") { await assert.rejects(run); assert.equal(requests, 0); }
      else { const result = await run; assert.equal(requests, 1); assert.doesNotMatch(result.stdout + result.stderr, /production-fixture|local-fixture|inherited-fixture/); }
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  });
}
test("AI audit CLI loads the actual CommonJS Next environment package", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ai-env-"));
  try {
    const { stdout, stderr } = await exec(process.execPath, [resolve("scripts/audit-ai-runtime.mjs")], {
      cwd: dir, env: { ...process.env, OPENAI_API_KEY: "", AI_CORE_ENABLE_EXTERNAL_CALLS: "false" },
    });
    const report = JSON.parse(stdout);
    assert.equal(report.configured, false);
    assert.equal(report.generationRequests, 0);
    assert.equal(report.databaseWrites, 0);
    assert.equal(stderr, "");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
