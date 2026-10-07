import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("navbar campaign search is hydrated from the URL", () => {
  const source = read("app/[locale]/_components/CampaignsPageContent.tsx");
  assert.match(source, /useSearchParams/);
  assert.match(source, /urlSearchParams\.get\("search"\)/);
});

test("category search is sent to the API before pagination", () => {
  const source = read("app/[locale]/category/[id]/_components/MainPage.tsx");
  assert.match(source, /useDebounce/);
  assert.match(source, /search: debouncedSearch/);
  assert.match(source, /\[id, effectiveLocale, debouncedSearch\]/);
});

test("blog search filters in the database before take/cursor pagination", () => {
  const source = read("app/api/posts/route.ts");
  const where = source.indexOf("const where = search");
  const query = source.indexOf("prisma.post.findMany");
  assert.ok(where >= 0 && query > where);
  assert.match(source, /where,/);
  assert.doesNotMatch(source, /let filtered = posts/);
});

test("dashboard table search uses a global row filter", () => {
  const source = read("app/(dashboard)/dashboard/_components/data-table.tsx");
  assert.match(source, /onGlobalFilterChange/);
  assert.match(source, /globalFilterFn/);
  assert.match(source, /flatten\(row\.original\)/);
});

test("donation search is server-side and current API page is not sliced again", () => {
  const page = read("app/(dashboard)/dashboard/donations/page.tsx");
  const api = read("app/api/donations/route.ts");
  assert.match(page, /search: debouncedSearch/);
  assert.match(page, /const paginatedDonations = filteredDonations/);
  assert.doesNotMatch(page, /filteredDonations\.slice/);
  assert.match(api, /providerOrderId/);
  assert.match(api, /phone: \{ contains: search/);
  assert.match(api, /items:/);
  assert.match(api, /categoryItems:/);
});
