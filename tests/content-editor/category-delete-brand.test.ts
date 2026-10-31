import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { deleteEmptyCategory } from "../../lib/campaign/delete-empty-category";
import { institutionalHomeTitle, siteIdentitySchemas, withInstitutionalHomeIdentity } from "../../lib/site-identity";
import { LOCALE_SEO, SITE_NAME } from "../../lib/seo";
import { SUPPORTED_LOCALES } from "../../lib/locales";

const id = "111111111111111111111111", other = "222222222222222222222222";
function fixture(options: { count?: number; live?: boolean; donations?: number; subscriptions?: number; pages?: number; stale?: boolean; rawFailure?: boolean; auditFailure?: boolean; missing?: boolean } = {}) {
  const state = {
    category: options.missing ? null : { id, name: "Synthetic category", editorVersion: null as string | null, campaignIds: [other] },
    projects: Array.from({ length: options.count ?? 5 }, (_, n) => ({ id: String(n), isActive: options.live ? false : true, isDeleted: !options.live, categoryIds: [id, other], categoryPriorities: { [id]: 3, [other]: 5 } as Record<string, number> })),
    financialLedger: [{ amount: 23, currency: "USD", projectId: "0", paidAt: "2026-10-25" }],
    audits: [] as unknown[],
  };
  let writes = 0;
  const tx = {
    category: {
      findFirst: async () => state.category,
      update: async () => { if (options.stale) throw Object.assign(new Error("Concurrent change"), { code: "P2025" }); writes++; state.category!.campaignIds = []; return state.category; },
      delete: async () => { writes++; state.category = null; },
    },
    campaign: { findMany: async () => state.projects },
    donationCategoryItem: { count: async () => options.donations ?? 0 },
    subscriptionCategoryItem: { count: async () => options.subscriptions ?? 0 },
    superCategoryItem: { count: async () => options.pages ?? 0 },
    $runCommandRaw: async (command: { update: string; updates: Array<{ q: unknown; u: { $pull: { categoryIds: { $oid: string } }; $unset: Record<string, string> } }> }) => {
      assert.equal(command.update, "Campaign");
      assert.equal(command.updates[0].u.$pull.categoryIds.$oid, id);
      assert.deepEqual(Object.keys(command.updates[0].u.$unset), [`categoryPriorities.${id}`]);
      if (options.rawFailure) return { ok: 1, writeErrors: [{ code: 100 }] };
      writes++;
      for (const project of state.projects) { project.categoryIds = project.categoryIds.filter(value => value !== id); delete project.categoryPriorities[id]; }
      return { ok: 1, nModified: state.projects.length };
    },
    auditLog: { create: async ({ data }: { data: unknown }) => { if (options.auditFailure) throw new Error("Audit unavailable"); writes++; state.audits.push(data); } },
  };
  const db = { $transaction: async (run: (client: typeof tx) => Promise<unknown>) => {
    const before = structuredClone(state);
    try { return await run(tx); } catch (error) { Object.assign(state, before); throw error; }
  } } as unknown as Pick<PrismaClient, "$transaction">;
  return { state, writes: () => writes, run: () => deleteEmptyCategory(db, { id }, { actorId: other, actorRole: "ADMIN" }) };
}

test("category deletion handles the five/seventeen soft-deleted project cases and retains shared projects and financial history", async () => {
  for (const count of [0, 5, 17]) {
    const f = fixture({ count });
    const ledger = structuredClone(f.state.financialLedger);
    const result = await f.run();
    assert.equal(result.state, "deleted");
    assert.equal(f.state.category, null);
    assert.equal(f.state.projects.length, count);
    for (const row of f.state.projects) {
      assert.deepEqual(row.categoryIds, [other]);
      assert.deepEqual(row.categoryPriorities, { [other]: 5 });
      assert.equal(row.isDeleted, true);
    }
    assert.deepEqual(f.state.financialLedger, ledger);
    assert.equal(f.state.audits.length, 1);
  }
});

test("a hidden but undeleted project and each direct financial/page reference prevent deletion with explicit counts", async () => {
  for (const options of [{ live: true }, { donations: 7 }, { subscriptions: 2 }, { pages: 1 }]) {
    const f = fixture(options), result = await f.run();
    assert.equal(result.state, "blocked");
    if (result.state === "blocked") assert.ok(result.references.projects || result.references.donations || result.references.subscriptions || result.references.pages);
    assert.equal(f.writes(), 0);
    assert.ok(f.state.category);
  }
});

test("failed detach, audit failure and concurrent category edits roll back instead of reporting successful deletion", async () => {
  for (const options of [{ rawFailure: true }, { auditFailure: true }, { stale: true }]) {
    const f = fixture(options), before = structuredClone(f.state);
    await assert.rejects(f.run);
    assert.deepEqual(f.state, before);
  }
  const missing = fixture({ missing: true });
  assert.equal((await missing.run()).state, "not_found");
  assert.equal(missing.writes(), 0);
});

test("all locale homepages identify the same hostname with the full institution name and the official full logo", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const schema = siteIdentitySchemas(locale), [org, website] = schema["@graph"];
    assert.equal(org.name, LOCALE_SEO[locale].siteName);
    assert.equal(org.logo?.url, "https://minberiaksa.org/brand/minber-logo-full.webp");
    assert.equal(website["@type"], "WebSite");
    assert.equal(website.name, "مؤسسة منبر الأقصى الدولية");
    assert.equal(website.url, "https://minberiaksa.org/");
    assert.equal(website["@id"], "https://minberiaksa.org/#website");
  }
  assert.equal(SITE_NAME, LOCALE_SEO.ar.siteName);
});

test("published homepage overrides keep their intent, currency/query/canonical data and complete localized institutional branding", () => {
  assert.equal(institutionalHomeTitle("تبرع للقدس وغزة | مؤسسة منبر الأقصى", "ar"), "تبرع للقدس وغزة | مؤسسة منبر الأقصى الدولية");
  for (const locale of SUPPORTED_LOCALES) {
    const name = LOCALE_SEO[locale].siteName;
    const input = { title: `Home | ${name}`, description: "Original description", alternates: { canonical: `https://minberiaksa.org/${locale}` }, openGraph: { title: "Authored share title" }, twitter: { title: "Authored social title" } };
    const output = withInstitutionalHomeIdentity(input, locale);
    assert.deepEqual(output.title, { absolute: `Home | ${name}` });
    assert.equal(output.applicationName, name);
    assert.equal(output.description, input.description);
    assert.deepEqual(output.alternates, input.alternates);
    assert.equal(input.twitter.title, "Authored social title", "input is not mutated");
  }
});
