import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  campaignWhereForDonationSearch,
  campaignTranslationWhereForDonationSearch,
  categoryWhereForDonationSearch,
  categoryTranslationWhereForDonationSearch,
  donationWhereForIds,
  donationWhereForDonorSearch,
  uniqueDonationIds,
  userWhereForDonorSearch,
} from "../../lib/dashboard/donation-search";

test("donation search matches donors by case-insensitive name, email or phone", () => {
  assert.deepEqual(userWhereForDonorSearch("  sample donor  "), {
    OR: [
      { name: { contains: "sample donor", mode: "insensitive" } },
      { email: { contains: "sample donor", mode: "insensitive" } },
      { phone: { contains: "sample donor", mode: "insensitive" } },
    ],
  });
});

test("donation search matches project and category titles in every locale", () => {
  assert.deepEqual(campaignWhereForDonationSearch("  Al-Quds  "), {
    title: { contains: "Al-Quds", mode: "insensitive" },
  });
  assert.deepEqual(campaignTranslationWhereForDonationSearch("  Al-Quds  "), {
    title: { contains: "Al-Quds", mode: "insensitive" },
  });
  assert.deepEqual(categoryWhereForDonationSearch("  Al-Quds  "), {
    name: { contains: "Al-Quds", mode: "insensitive" },
  });
  assert.deepEqual(categoryTranslationWhereForDonationSearch("  Al-Quds  "), {
    name: { contains: "Al-Quds", mode: "insensitive" },
  });
});

test("donation search joins through scalar donor IDs without querying ObjectId text", () => {
  assert.deepEqual(
    donationWhereForDonorSearch(["507f1f77bcf86cd799439011"], ["donation-id"]),
    {
      OR: [
        { donorId: { in: ["507f1f77bcf86cd799439011"] } },
        { id: { in: ["donation-id"] } },
      ],
    },
  );
});

test("project and category filters resolve through scalar donation IDs", () => {
  assert.deepEqual(donationWhereForIds(["one", "one", "two"]), {
    id: { in: ["one", "two"] },
  });
  assert.deepEqual(uniqueDonationIds(["one", "two"], ["two", "three"]), [
    "one",
    "two",
    "three",
  ]);
});

test("donations API performs the donor lookup before applying its scalar filter", () => {
  const source = readFileSync("app/api/donations/route.ts", "utf8");
  const helper = readFileSync("lib/dashboard/donation-search.ts", "utf8");
  const searchBlock = source.slice(
    source.indexOf("// Search donor/project/category fields"),
    source.indexOf("const localeWhere"),
  );

  assert.match(searchBlock, /prisma\.user\.findMany/);
  assert.match(searchBlock, /prisma\.campaign\.findMany/);
  assert.match(searchBlock, /campaignWhereForDonationSearch\(search\)/);
  assert.match(searchBlock, /prisma\.campaignTranslation\.findMany/);
  assert.match(searchBlock, /campaignTranslationWhereForDonationSearch\(search\)/);
  assert.match(searchBlock, /prisma\.category\.findMany/);
  assert.match(searchBlock, /categoryWhereForDonationSearch\(search\)/);
  assert.match(searchBlock, /prisma\.categoryTranslation\.findMany/);
  assert.match(searchBlock, /categoryTranslationWhereForDonationSearch\(search\)/);
  assert.match(searchBlock, /prisma\.donationItem\.findMany/);
  assert.match(searchBlock, /prisma\.donationCategoryItem\.findMany/);
  assert.match(searchBlock, /userWhereForDonorSearch\(search\)/);
  assert.match(searchBlock, /donationWhereForDonorSearch\(donorIds, matchingDonationIds\)/);
  assert.match(searchBlock, /donorIds\.length === 0 && matchingDonationIds\.length === 0/);
  assert.match(searchBlock, /providerOrderId: \{ contains: search/);
  assert.match(searchBlock, /\^\[a-f0-9\]\{24\}\$\/i\.test\(search\)/);
  assert.match(helper, /phone: \{ contains: term/);
  assert.doesNotMatch(searchBlock, /id:\s*\{\s*contains:/);
  assert.doesNotMatch(searchBlock, /donor:\s*\{/);
  assert.doesNotMatch(searchBlock, /items:\s*\{/);
  assert.doesNotMatch(searchBlock, /categoryItems:\s*\{/);
});

test("donations API applies project and category filters without relation traversal", () => {
  const source = readFileSync("app/api/donations/route.ts", "utf8");
  const filterBlock = source.slice(
    source.indexOf("// Resolve project/category links"),
    source.indexOf("// Search the donor's scalar fields"),
  );

  assert.match(filterBlock, /resolveDonationRelationFilterIds/);
  assert.match(filterBlock, /donationWhereForIds\(donationIds\)/);
  assert.match(filterBlock, /donationWhereForIds\(relationIds\.categoryDonationIds/);
  assert.doesNotMatch(filterBlock, /items:\s*\{\s*some:/);
  assert.doesNotMatch(filterBlock, /categoryItems:\s*\{\s*some:/);
});

test("dashboard chart and metrics share scalar donation relation filters", () => {
  const chart = readFileSync("app/api/admin/donations/chart/route.ts", "utf8");
  const stats = readFileSync("app/api/admin/stats/route.ts", "utf8");

  assert.match(chart, /resolveDonationRelationFilterIds/);
  assert.match(chart, /donationWhereForIds\(relationIds\.campaignDonationIds/);
  assert.match(stats, /resolveDonationRelationFilterIds/);
  assert.match(stats, /resolveSubscriptionRelationFilterIds/);
  assert.doesNotMatch(chart, /items:\s*\{\s*some:/);
  assert.doesNotMatch(stats, /base\.items\s*=\s*\{\s*some:/);
  assert.doesNotMatch(stats, /base\.OR\s*=\s*\[/);
});

test("changing dashboard category clears a selected project outside that category", () => {
  const source = readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8");
  assert.match(source, /onValueChange=\{\(categoryId\) =>/);
  assert.match(source, /setSelectedCampaign\("all"\)/);
});

test("donation-failed page has one hosted donation form instead of duplicate embeds", () => {
  const source = readFileSync("app/[locale]/donation-failed/page.tsx", "utf8");
  assert.equal((source.match(/<iframe\b/g) ?? []).length, 1);
  assert.match(source, /id="donate-again"/);
  assert.doesNotMatch(source, /CHARITY_GIVING_NOTICES/);
});
