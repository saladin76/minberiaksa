import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { userHasDashboardPermission } from "../../lib/dashboard/permissions";
import { pickTranslation, translationLocaleWhere } from "../../lib/i18n/translation-fallback";

type Role = "ADMIN" | "REVENUE_STAFF" | "CAMPAIGN_STAFF" | "DONOR" | "ANONYMOUS";
type Response = { status: number; body: Record<string, unknown>; headers?: Record<string, string> };

function run(role: Role, locale = "ar") {
  const queries: unknown[] = [];
  const user =
    role === "ANONYMOUS" ? null :
    role === "ADMIN" ? { role: "ADMIN", dashboardPermissions: [] } :
    role === "REVENUE_STAFF" ? { role: "STAFF", dashboardPermissions: ["revenue"] } :
    role === "CAMPAIGN_STAFF" ? { role: "STAFF", dashboardPermissions: ["campaigns"] } :
    { role: "DONOR", dashboardPermissions: ["revenue"] };
  const response = (body: Record<string, unknown>, init: { status?: number; headers?: Record<string, string> } = {}): Response =>
    ({ status: init.status ?? 200, body, headers: init.headers });
  const rows = [{
    id: "campaign-1",
    title: "مشروع",
    categoryIds: ["cat-1", "cat-2"],
    translations: locale === "tr" ? [{ locale: "tr", title: "Proje" }] : [],
    // Private editor/payment fields must never leak to dashboard filter options.
    paymentConfiguration: "secret-not-for-options",
  }];
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: response } },
    "next-auth": { getServerSession: async () => user ? { user } : null },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": {
      requireAdminOrDashboardPermission: (
        session: { user: typeof user } | null, permission: "revenue",
      ) => !session?.user
        ? response({ error: "Unauthorized" }, { status: 401 })
        : userHasDashboardPermission(session.user, permission)
        ? null
        : response({ error: "Forbidden" }, { status: 403 }),
    },
    "@/lib/prisma": { prisma: { campaign: { findMany: async (query: unknown) => {
      queries.push(query);
      return rows;
    } } } },
    "@/lib/campaign/soft-delete-filter": { NOT_SOFT_DELETED: { isDeleted: false } },
    "@/lib/i18n/translation-fallback": { pickTranslation, translationLocaleWhere },
  };
  const exports: Record<string, (request: { nextUrl: { searchParams: URLSearchParams } }) => Promise<Response>> = {};
  const code = ts.transpileModule(
    readFileSync("app/api/admin/dashboard-filter-options/route.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  new vm.Script(code).runInNewContext({
    module: { exports }, exports, URLSearchParams, console: { error() {} },
    require: (name: string) => dependencies[name] ?? {},
  });
  return {
    queries,
    get: () => exports.GET({ nextUrl: { searchParams: new URLSearchParams({ locale }) } }),
  };
}

test("unauthenticated and unauthorized users cannot query dashboard filter options", async () => {
  for (const role of ["ANONYMOUS", "CAMPAIGN_STAFF", "DONOR"] as const) {
    const h = run(role);
    const result = await h.get();
    assert.equal(result.status, role === "ANONYMOUS" ? 401 : 403, role);
    assert.equal(h.queries.length, 0, role);
  }
});

test("revenue-only staff and ADMIN can query localized minimal campaign options", async () => {
  for (const role of ["ADMIN", "REVENUE_STAFF"] as const) {
    const h = run(role, "tr");
    const result = await h.get();
    assert.equal(result.status, 200, role);
    assert.deepEqual(JSON.parse(JSON.stringify(result.body)), {
      items: [{ id: "campaign-1", title: "Proje", categoryIds: ["cat-1", "cat-2"] }],
    });
    assert.equal(result.headers?.["Cache-Control"], "private, no-store");
    assert.equal(h.queries.length, 1);
    assert.equal(JSON.stringify(h.queries[0]).includes("paymentConfiguration"), false);
  }
});
