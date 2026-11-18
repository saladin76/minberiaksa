import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

/** Runs the exact cache code shipped in lib/minbar/projects.ts against a counting fake read. */
function load(read: (locale: string, o: { categoryId?: string; limit?: number }) => Promise<unknown[]>, clock: { now: number }, nodeEnv = "production") {
  const src = fs.readFileSync("lib/minbar/projects.ts", "utf8");
  const snippet = src.slice(src.indexOf("const PUBLISHED_ROWS_TTL_MS"), src.indexOf("function toProject("));
  assert.ok(snippet.includes("async function findPublishedCampaignRows("), "cache wrapper present");
  const js = ts.transpileModule(snippet.replace("export function clearPublishedCampaignCache", "function clearPublishedCampaignCache") + "\n;globalThis.api = { findPublishedCampaignRows, clearPublishedCampaignCache };",
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const ctx: Record<string, unknown> = { readPublishedCampaignRows: read, Map, JSON, Promise, Date: { now: () => clock.now }, process: { env: { NODE_ENV: nodeEnv } } };
  ctx.globalThis = ctx; vm.runInNewContext(js, ctx);
  return ctx.api as { findPublishedCampaignRows: (l: string, o?: { categoryId?: string; limit?: number }) => Promise<unknown[]>; clearPublishedCampaignCache: () => void };
}

test("the published list is read once per minute and per (locale, category, limit)", async () => {
  let reads = 0; const clock = { now: 0 };
  const api = load(async (l, o) => { reads++; return [{ id: `${l}-${o.categoryId ?? "all"}-${reads}` }]; }, clock);
  await api.findPublishedCampaignRows("ar"); await api.findPublishedCampaignRows("ar"); await api.findPublishedCampaignRows("ar");
  assert.equal(reads, 1, "related projects / programme / list pages share one read");
  await api.findPublishedCampaignRows("tr"); await api.findPublishedCampaignRows("ar", { categoryId: "c1" }); await api.findPublishedCampaignRows("ar", { limit: 6 });
  assert.equal(reads, 4, "separate entries per locale, category and limit");
  clock.now += 59_000; await api.findPublishedCampaignRows("ar"); assert.equal(reads, 4);
  clock.now += 2_000; await api.findPublishedCampaignRows("ar"); assert.equal(reads, 5, "refreshed after 60 s");
  api.clearPublishedCampaignCache(); await api.findPublishedCampaignRows("ar"); assert.equal(reads, 6);
});

test("concurrent visitors share one in-flight read, each gets its own array", async () => {
  let reads = 0; const api = load(async () => { reads++; await new Promise((r) => setTimeout(r, 10)); return [{ id: "b" }, { id: "a" }]; }, { now: 0 });
  const [x, y] = await Promise.all([api.findPublishedCampaignRows("ar"), api.findPublishedCampaignRows("ar")]);
  assert.equal(reads, 1);
  x.reverse(); assert.deepEqual(plain(y.map((r) => (r as { id: string }).id)), ["b", "a"], "an in-place sort by one caller never leaks to another");
  assert.deepEqual(plain((await api.findPublishedCampaignRows("ar")).map((r) => (r as { id: string }).id)), ["b", "a"]);
});

test("a failed read is not cached", async () => {
  let reads = 0; const api = load(async () => { reads++; if (reads === 1) throw new Error("db down"); return [{ id: "ok" }]; }, { now: 0 });
  await assert.rejects(api.findPublishedCampaignRows("ar"));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(plain(await api.findPublishedCampaignRows("ar")), [{ id: "ok" }]); assert.equal(reads, 2);
});

test("a single project page still reads its project fresh (not cached)", () => {
  const src = fs.readFileSync("lib/minbar/projects.ts", "utf8");
  const getProject = src.slice(src.indexOf("export async function getProject("), src.indexOf("export async function getProjectSeo("));
  assert.match(getProject, /prisma\.campaign\.findFirst/); assert.doesNotMatch(getProject, /publishedRowsCache|findPublishedCampaignRows/);
});

test("outside production (tests, development) every read is fresh", async () => {
  let reads = 0; const api = load(async () => { reads++; return []; }, { now: 0 }, "test");
  await api.findPublishedCampaignRows("ar"); await api.findPublishedCampaignRows("ar");
  assert.equal(reads, 2);
});
