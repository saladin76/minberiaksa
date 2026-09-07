import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import type { Session } from "next-auth";
import { resolveDashboardPageAccess } from "../../lib/dashboard/page-access";
import {
  createDashboardPageDataLoader,
  createDashboardPagePermissionGuard,
} from "../../lib/dashboard/page-permission";
import { createBlogAdminEditorDataLoaders } from "../../lib/blog/admin-editor-data-core";
import {
  contentLocalizationPermissionForSection,
  parseContentLocalizationSection,
} from "../../lib/content-localization/access";

function sessionFor(
  role: "ADMIN" | "STAFF" | "DONOR",
  permissions: string[] = [],
): Session {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: {
      id: `test-${role.toLowerCase()}`,
      name: "Test User",
      email: "test@example.org",
      role,
      dashboardPermissions: permissions,
    },
  } as Session;
}

class RedirectSignal extends Error {
  constructor(readonly redirectTo: string) {
    super(`redirect:${redirectTo}`);
  }
}

function guardedLoaderFor(session: Session | null) {
  const guard = createDashboardPagePermissionGuard(
    async () => session,
    (redirectTo) => {
      throw new RedirectSignal(redirectTo);
    },
  );
  return createDashboardPageDataLoader(guard);
}

function blogEditorLoadersFor(session: Session | null) {
  let getPostCalls = 0;
  let postCategoryReads = 0;
  let campaignReads = 0;
  const guardedLoad = guardedLoaderFor(session);

  const loaders = createBlogAdminEditorDataLoaders({
    loadDashboardPageData: (permission, loader) =>
      guardedLoad(permission, async () => loader()),
    getPost: async (postId: string) => {
      getPostCalls += 1;
      return { id: postId };
    },
    loadCategories: async () => {
      postCategoryReads += 1;
      return [{ id: "category-1", name: "Category" }];
    },
    loadCampaigns: async () => {
      campaignReads += 1;
      return [{ id: "campaign-1", title: "Campaign" }];
    },
  });

  return {
    ...loaders,
    calls: () => ({ getPostCalls, postCategoryReads, campaignReads }),
  };
}

const protectedSections = ["campaigns", "categories", "blog"] as const;

test("unauthenticated and donor users cannot enter protected content sections", () => {
  for (const permission of protectedSections) {
    assert.deepEqual(resolveDashboardPageAccess(null, permission), {
      allowed: false,
      redirectTo: "/ar/auth/signin",
    });
    assert.equal(resolveDashboardPageAccess(sessionFor("DONOR"), permission).allowed, false);
  }
});

test("staff without permissions cannot enter protected content sections", () => {
  for (const permission of protectedSections) {
    assert.equal(resolveDashboardPageAccess(sessionFor("STAFF"), permission).allowed, false);
  }
});

for (const ownPermission of protectedSections) {
  test(`staff with ${ownPermission} can enter only that section`, () => {
    const session = sessionFor("STAFF", [ownPermission]);
    for (const requiredPermission of protectedSections) {
      assert.equal(
        resolveDashboardPageAccess(session, requiredPermission).allowed,
        requiredPermission === ownPermission,
      );
    }
  });
}

test("admin can enter campaigns categories and blog", () => {
  const session = sessionFor("ADMIN");
  for (const permission of protectedSections) {
    assert.equal(resolveDashboardPageAccess(session, permission).allowed, true);
  }
});

test("denied users cannot start blog create or edit data reads", async () => {
  for (const deniedSession of [
    null,
    sessionFor("DONOR"),
    sessionFor("STAFF", ["campaigns"]),
  ]) {
    const createLoaders = blogEditorLoadersFor(deniedSession);
    await assert.rejects(
      createLoaders.loadBlogCreateEditorData(),
      RedirectSignal,
    );
    assert.deepEqual(createLoaders.calls(), {
      getPostCalls: 0,
      postCategoryReads: 0,
      campaignReads: 0,
    });

    const editLoaders = blogEditorLoadersFor(deniedSession);
    await assert.rejects(
      editLoaders.loadBlogEditEditorData("post-1"),
      RedirectSignal,
    );
    assert.deepEqual(editLoaders.calls(), {
      getPostCalls: 0,
      postCategoryReads: 0,
      campaignReads: 0,
    });
  }
});

test("admin and staff with blog permission can load blog editor data", async () => {
  for (const allowedSession of [
    sessionFor("ADMIN"),
    sessionFor("STAFF", ["blog"]),
  ]) {
    const createLoaders = blogEditorLoadersFor(allowedSession);
    const createData = await createLoaders.loadBlogCreateEditorData();
    assert.equal(createData.categories.length, 1);
    assert.equal(createData.campaigns.length, 1);
    assert.deepEqual(createLoaders.calls(), {
      getPostCalls: 0,
      postCategoryReads: 1,
      campaignReads: 1,
    });

    const editLoaders = blogEditorLoadersFor(allowedSession);
    const editData = await editLoaders.loadBlogEditEditorData("post-1");
    assert.equal(editData.post?.id, "post-1");
    assert.equal(editData.categories.length, 1);
    assert.equal(editData.campaigns.length, 1);
    assert.deepEqual(editLoaders.calls(), {
      getPostCalls: 1,
      postCategoryReads: 1,
      campaignReads: 1,
    });
  }
});

test("layouts remain defense in depth and pages use only editor data loaders", () => {
  for (const permission of protectedSections) {
    const layout = readFileSync(
      `app/(dashboard)/dashboard/${permission}/layout.tsx`,
      "utf8",
    );
    assert.match(layout, /requireDashboardPagePermission/);
    assert.match(layout, new RegExp(`requireDashboardPagePermission\\("${permission}"\\)`));
  }

  const createPage = readFileSync(
    "app/(dashboard)/dashboard/blog/create/page.tsx",
    "utf8",
  );
  const editPage = readFileSync(
    "app/(dashboard)/dashboard/blog/create/[postId]/page.tsx",
    "utf8",
  );
  assert.match(createPage, /loadBlogCreateEditorData\(\)/);
  assert.match(editPage, /loadBlogEditEditorData\(postId\)/);
  assert.doesNotMatch(createPage, /prisma\.|getPost|loadDashboardPageData/);
  assert.doesNotMatch(editPage, /prisma\.|getPost|loadDashboardPageData/);
});

test("server-only editor data module owns protected Prisma and getPost reads", () => {
  const source = readFileSync("lib/blog/admin-editor-data.ts", "utf8");
  assert.match(source, /import "server-only"/);
  assert.match(source, /loadDashboardPageData/);
  assert.match(source, /getPost/);
  assert.match(source, /prisma\.postCategory\.findMany/);
  assert.match(source, /prisma\.campaign\.findMany/);
  assert.match(source, /loadBlogCreateEditorData/);
  assert.match(source, /loadBlogEditEditorData/);
});

test("targeted TypeScript scope includes editor data without legacy editor pages", () => {
  const tsconfig = readFileSync("tsconfig.cms-security.json", "utf8");
  assert.match(tsconfig, /lib\/blog\/admin-editor-data\.ts/);
  assert.match(tsconfig, /lib\/blog\/admin-editor-data-core\.ts/);
  assert.doesNotMatch(tsconfig, /dashboard\/blog\/create\/page\.tsx/);
  assert.doesNotMatch(tsconfig, /dashboard\/blog\/create\/\[postId\]\/page\.tsx/);
});

test("localization sections map only to existing section permissions", () => {
  assert.equal(contentLocalizationPermissionForSection("campaigns"), "campaigns");
  assert.equal(contentLocalizationPermissionForSection("categories"), "categories");
  assert.equal(contentLocalizationPermissionForSection("blog"), "blog");
  assert.equal(parseContentLocalizationSection("content"), null);
  assert.equal(parseContentLocalizationSection("unknown"), null);
});

test("localization audit and preview authorize by requested section", () => {
  for (const path of [
    "app/api/admin/content-localization/audit/route.ts",
    "app/api/admin/content-localization/preview/route.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    const handler = source.slice(source.indexOf("export async function GET"));
    const parseIndex = handler.indexOf("parseContentLocalizationSection");
    const directAuthIndex = handler.indexOf("contentLocalizationPermissionForSection(section)");
    const delegatedAuthIndex = handler.indexOf("authorize(section)");
    const authIndex = directAuthIndex >= 0 ? directAuthIndex : delegatedAuthIndex;
    const loadIndex = handler.indexOf("loadPreviewRows(") >= 0
      ? handler.indexOf("loadPreviewRows(")
      : handler.indexOf("loadItems(section)");
    assert.ok(parseIndex >= 0, `${path} must parse a known section`);
    assert.ok(authIndex > parseIndex, `${path} must authorize the parsed section`);
    assert.ok(loadIndex > authIndex, `${path} must authorize before loading section data`);
    assert.doesNotMatch(source, /requireAdminOrDashboardPermission\([^)]*["']content["']/s);
    assert.match(source, /contentLocalizationPermissionForSection\(section\)/);
  }
});

test("direct bulk Arabic mutation is disabled without OpenAI or database access", () => {
  const source = readFileSync(
    "app/api/admin/content-localization/arabic-bulk-proofread/route.ts",
    "utf8",
  );
  assert.match(source, /Direct bulk proofreading is temporarily disabled/);
  assert.match(source, /status: 409/);
  assert.doesNotMatch(source, /api\.openai\.com|OPENAI_API_KEY|prisma\.|saveArabicItem|proofreadArabic/);
});

test("localization apply is authorized, section-scoped and field-scoped", () => {
  const api = readFileSync("app/api/admin/content-localization/preview/route.ts", "utf8");
  const card = readFileSync(
    "app/(dashboard)/dashboard/_components/ContentLocalizationAuditCard.tsx",
    "utf8",
  );

  const handler = api.slice(api.indexOf("export async function POST"));
  const authIndex = handler.indexOf("authorize(section)");
  const applyIndex = handler.indexOf('body?.action === "apply"');
  assert.ok(authIndex >= 0, "apply handler must authorize the parsed section");
  assert.ok(
    applyIndex > authIndex,
    "apply must not run before the section permission check",
  );

  // The payload's item types are validated against the section, so a caller
  // holding only `campaigns` cannot reach category or blog rows.
  assert.match(api, /const SECTION_TYPES: Record<\s*\n?\s*ContentLocalizationSection/);
  assert.match(api, /parseApplyItems\(body\?\.items, section\)/);

  // Writes stay inside the localization whitelist: translatable text on the four
  // content models and nothing else. The rich-text article body is excluded.
  assert.match(api, /const APPLY_FIELDS: Record<ItemType/);
  assert.doesNotMatch(api, /^\s*post: \["title", "description", "content"\],$/m);
  const allowedWrites = new Set([
    "prisma.campaign.update(",
    "prisma.category.update(",
    "prisma.post.update(",
    "prisma.postCategory.update(",
    "prisma.slide.update(",
    "prisma.campaignTranslation.upsert(",
    "prisma.categoryTranslation.upsert(",
    "prisma.postTranslation.upsert(",
    "prisma.postCategoryTranslation.upsert(",
    "prisma.slideTranslation.upsert(",
  ]);
  for (const write of api.match(/prisma\.[A-Za-z]+\.[A-Za-z]+\(/g) || []) {
    if (write.endsWith(".findMany(") || write.endsWith(".findUnique(")) continue;
    assert.ok(allowedWrites.has(write), `unexpected write target: ${write}`);
  }

  assert.doesNotMatch(card, /arabic-bulk-proofread|تدقيق العربي بالكامل/);
});

test("read-only localization audit retains actionable item details", () => {
  const card = readFileSync(
    "app/(dashboard)/dashboard/_components/ContentLocalizationAuditCard.tsx",
    "utf8",
  );
  assert.match(card, /العناصر التي تحتاج عملًا/);
  assert.match(card, /item\.label/);
  assert.match(card, /item\.typeLabel/);
  assert.match(card, /missingFields/);
  assert.match(card, /emptyFields/);
  assert.match(card, /identicalToArabicFields/);
  assert.match(card, /ملاحظات جودة العربية/);
  assert.match(card, /label="حقول فارغة" value=\{totals\.emptyFields\}/);
  assert.doesNotMatch(card, /حقول ناقصة أوفارغة/);
});

// "operations content permission boundary remains unchanged" read
// app/(dashboard)/dashboard/operations/layout.tsx, removed with التشغيل. There is no boundary
// left to assert on — the permission key is gone too.

test("targeted CMS security TypeScript check passes", () => {
  execFileSync(process.execPath, [
    "node_modules/typescript/bin/tsc",
    "-p",
    "tsconfig.cms-security.json",
  ], { stdio: "pipe" });
});

test("primary Prisma schema validates without modification", () => {
  execFileSync(process.execPath, [
    "node_modules/prisma/build/index.js",
    "validate",
    "--schema",
    "prisma/schema.prisma",
  ], { stdio: "pipe" });
});
