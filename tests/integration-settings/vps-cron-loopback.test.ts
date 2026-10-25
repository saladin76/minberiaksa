import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const exec = promisify(execFile);

for (const host of ["127.0.0.1", "::1"]) {
  test(`cron reaches ${host} exactly once using the default localhost URL`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "cron-loopback-"));
    let requests = 0;
    const server = http.createServer((request, response) => {
      requests++;
      assert.equal(request.headers.authorization, "Bearer fixture-secret");
      response.writeHead(200); response.end("ok");
    });
    try {
      await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, host, resolve); });
      const port = (server.address() as { port: number }).port;
      await exec("bash", ["scripts/vps-cron-run.sh", `/api/cron/fixture-${host.replace(/:/g, "_")}`], {
        env: { ...process.env, PORT: String(port), CRON_BASE_URL: "", CRON_SECRET: "fixture-secret", CRON_LOG: join(dir, "cron.log"), http_proxy: "http://127.0.0.1:1", ALL_PROXY: "http://127.0.0.1:1" },
      });
      assert.equal(requests, 1);
      assert.match(await readFile(join(dir, "cron.log"), "utf8"), /HTTP 200/);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
  });
}

test("an HTTP error is logged without retrying an accepted cron request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cron-failure-")); let requests = 0;
  const server = http.createServer((_request, response) => { requests++; response.writeHead(503); response.end("temporarily unavailable"); });
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    await assert.rejects(exec("bash", ["scripts/vps-cron-run.sh", "/api/cron/fixture-error"], { env: {
      ...process.env, PORT: String((server.address() as {port: number}).port), CRON_BASE_URL: "", CRON_SECRET: "fixture-secret", CRON_LOG: join(dir, "cron.log"),
    } }));
    assert.equal(requests, 1); assert.match(await readFile(join(dir, "cron.log"), "utf8"), /HTTP 503 temporarily unavailable/);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); await rm(dir, {recursive: true, force: true}); }
});
