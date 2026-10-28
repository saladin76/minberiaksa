import test from "node:test";
import assert from "node:assert/strict";
import { readDashboardJson } from "../../lib/dashboard/read-json";

test("a stalled response body ends at the dashboard deadline instead of leaving a permanent skeleton", async () => {
  const original = globalThis.fetch;
  let captured: AbortSignal | undefined;
  globalThis.fetch = async (_url, options) => { captured = options?.signal as AbortSignal; return {ok:true,json:()=>new Promise(()=>{})} as Response; };
  try {
    await assert.rejects(readDashboardJson("/fixture", new AbortController().signal, 15), /DASHBOARD_READ_TIMEOUT/);
    assert.equal(captured?.aborted,true);
  } finally { globalThis.fetch = original; }
});

test("HTML errors and failed financial reads never become successful empty dashboard data", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("<html>Unavailable</html>",{status:503});
    await assert.rejects(readDashboardJson("/fixture",new AbortController().signal));
    globalThis.fetch = async () => Response.json({ok:false,campaigns:[]},{status:503});
    await assert.rejects(readDashboardJson("/fixture",new AbortController().signal),/DASHBOARD_READ_FAILED/);
  } finally { globalThis.fetch = original; }
});
