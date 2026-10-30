import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { RANKED_CAMPAIGNS, UNRANKED_CAMPAIGNS } from "../../lib/campaign/priority-filter";
import { NOT_SOFT_DELETED } from "../../lib/campaign/soft-delete-filter";
import { mergeProjectPriorityGroups } from "../../lib/minbar/project-order";
import { selectProgrammeRelatedProjects } from "../../lib/minbar/project-filter-options";

type Row = Record<string, unknown>;
/** Model Prisma/Mongo's distinction between explicit null and an absent field. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND") return (condition as Row[]).every(item => matches(row, item));
    if (key === "OR") return (condition as Row[]).some(item => matches(row, item));
    if (key === "NOT") { const clause = condition as Row; return Object.keys(clause).every(field => field in row) && !matches(row, clause); }
    const present = key in row, value = row[key];
    if (condition === null) return present && value === null;
    if (condition && typeof condition === "object") {
      const rule = condition as Row;
      return (!("isSet" in rule) || present === rule.isSet) && (!("not" in rule) || present && value !== rule.not);
    }
    return present && value === condition;
  });
}
function fixture(restoration = false) {
  const make = (index: number, fields: Row) => ({ id: String(index).repeat(24), title: "Project " + index, description: "Copy", slug: "project-" + index, isActive: true, goalType: "OPEN", fundraisingMode: "AMOUNT", currentAmount: 15, targetAmount: 0, createdAt: new Date("2026-10-" + (10 + index)), images: [], translations: [], categories: [], _count: { donations: 1 }, ...fields });
  const rows = [make(1, { priority: 0, isDeleted: false }), make(2, { priority: null }), make(3, {}), make(4, { isActive: false }), make(5, { isDeleted: true })];
  if (restoration) rows[0].slug = "al-quds-home-restoration";
  const initial = structuredClone(rows), reads: Row[] = [];
  const db = { campaign: {
    count: async ({ where }: { where: Row }) => rows.filter(row => matches(row, where)).length,
    findUnique: async ({ where }: { where: { id: string } }) => rows.find(row => row.id === where.id),
    findMany: async (args: Row) => {
      reads.push(args);
      let result = rows.filter(row => matches(row, args.where as Row));
      const order = Array.isArray(args.orderBy) ? args.orderBy as Row[] : [args.orderBy as Row];
      result.sort((a, b) => { for (const rule of order) for (const [key, direction] of Object.entries(rule)) { const av = a[key as keyof typeof a], bv = b[key as keyof typeof b]; if (av !== bv) { const difference = av instanceof Date && bv instanceof Date ? av.getTime() - bv.getTime() : Number(av) - Number(bv); if (difference) return direction === "desc" ? -difference : difference; } } return 0; });
      const cursor = args.cursor as { id: string } | undefined;
      const start = cursor ? result.findIndex(row => row.id === cursor.id) + Number(args.skip || 0) : Number(args.skip || 0);
      result = result.slice(start); return args.take ? result.slice(0, Number(args.take)) : result;
    },
  } };
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: Response.json } }, "@prisma/client": {}, "@/lib/prisma": { prisma: db }, "server-only": {},
    "next-auth": {}, "../auth/[...nextauth]/options": {}, "@/lib/dashboard/api-auth": {}, "@/lib/audit-log": {}, "@/lib/dashboard/write-error-message": {}, "@/lib/campaign/admin-create-core": {}, "@/lib/campaign/admin-create": {},
    "@/lib/campaign/priority-filter": { RANKED_CAMPAIGNS, UNRANKED_CAMPAIGNS }, "@/lib/campaign/soft-delete-filter": { NOT_SOFT_DELETED },
    "@/lib/campaign/include-inactive-query": { parseIncludeInactive: () => false },
    "@/lib/campaign/suggested-donations": { parseSuggestedDonations: () => ({ byCurrency: {} }), cardDonationAmounts: () => [] },
    "@/lib/campaign/suggested-team-support": { parseSuggestedTeamSupport: () => ({}) }, "@/lib/campaign/share-labels": { parseShareLabels: () => ({}) },
    "@/lib/campaign/campaign-modes": { FUNDRAISING_SHARES: "SHARES", computeCampaignProgressPercent: () => 0, normalizeFundraisingMode: () => "AMOUNT", normalizeGoalType: () => "OPEN", parseSuggestedShareCounts: () => ({}), showCampaignProgress: () => false },
    "@/lib/i18n/translation-fallback": { translationLocaleWhere: () => ({}), pickTranslation: () => null }, "@/lib/campaign/categories": { parseCategoryPriorities: () => ({}) },
    "@/lib/content-editor/public-preview": {}, "@/lib/content/video-platform": {}, "@/lib/slug": {}, "@/lib/dashboard/donation-usd-revenue": {}, "@/lib/campaign/project-seo": {},
    "@/lib/blog/rich-text": { contentToBlocks: (text: string) => [{ kind: "p", text }] }, "@/lib/minbar/recommended-frequency": { parseRecommendedFrequency: () => null }, "@/lib/minbar/project-order": { mergeProjectPriorityGroups },
    "./project-filter-options": { selectProgrammeRelatedProjects },
    "./restoration-programme": { getRestorationProgrammeProjectIds: async () => [rows[3].id, rows[2].id, rows[0].id, rows[1].id, rows[2].id] },
  };
  function load<T>(file: string): T { const loaded = { exports: {} }; const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText; new vm.Script(source).runInNewContext({ module: loaded, exports: loaded.exports, console, require: (name: string) => { if (!(name in deps)) throw new Error(name); return deps[name]; } }); return loaded.exports as T; }
  const api = load<{ GET: (request: { nextUrl: URL }) => Promise<Response> }>("app/api/campaigns/route.ts");
  type Project = { id: string; slug: string; baseSlug?: string };
  const cms = load<{ listProjects: (locale: string, limit?: number) => Promise<Project[]>; listRelatedProjects: (project: Project, locale: string) => Promise<Project[]> }>("lib/minbar/projects.ts");
  return { rows, initial, reads, get: async (query: string) => (await api.GET({ nextUrl: new URL("https://fixture.test/?" + query) })).json(), cms };
}
test("public project pages include legacy unset priority across offset and cursor pagination without publishing inactive or deleted projects", async () => {
  const h = fixture(), expected = [h.rows[0].id, h.rows[2].id, h.rows[1].id];
  const first = await h.get("page=1&limit=2"), second = await h.get("page=2&limit=2");
  assert.equal(first.total, 3); assert.deepEqual([...first.items, ...second.items].map(row => row.id), expected);
  const ids: string[] = []; let cursor = "";
  do { const page = await h.get("limit=1" + (cursor ? "&cursor=" + cursor : "")); ids.push(...page.items.map((row: { id: string }) => row.id)); cursor = page.nextCursor || ""; } while (cursor && ids.length < 10);
  assert.deepEqual(ids, expected); assert.deepEqual(h.rows, h.initial);
});
test("the established restoration donation page uses the CMS selection in order without itself or unpublished projects", async () => {
  const h = fixture(true), projects = await h.cms.listProjects("ar");
  assert.equal(projects[0].baseSlug, "al-quds-home-restoration");
  const cards = await h.cms.listRelatedProjects(projects[0], "ar");
  assert.deepEqual(cards.map(row => row.id), [h.rows[2].id, h.rows[1].id]);
  assert.deepEqual(h.rows, h.initial);
});
test("CMS project cards include missing-priority rows while explicit zero remains ranked", async () => {
  const h = fixture();
  assert.deepEqual((await h.cms.listProjects("ar")).map(row => row.id), [h.rows[0].id, h.rows[2].id, h.rows[1].id]);
  assert.deepEqual((await h.cms.listProjects("ar", 2)).map(row => row.id), [h.rows[0].id, h.rows[2].id]);
  const ranked = await h.get("hasPriority=true&page=1"); assert.deepEqual(ranked.items.map((row: { id: string }) => row.id), [h.rows[0].id]);
  assert.deepEqual(h.rows, h.initial);
});
