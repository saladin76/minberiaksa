import test from "node:test";
import assert from "node:assert/strict";
import type { Session } from "next-auth";
import {
  CampaignCreateValidationError,
  createCampaignCreator,
  parseCampaignCreatePayload,
  type CampaignCreateTransaction,
  type CampaignPersistenceData,
  type CampaignTranslationPersistenceData,
} from "../../lib/campaign/admin-create-core";
import { sessionHasDashboardPermission } from "../../lib/dashboard/permissions";

const CATEGORY_ID = "507f1f77bcf86cd799439011";
const OTHER_CATEGORY_ID = "507f1f77bcf86cd799439012";

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

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "مشروع مياه",
    description: JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "وصف عربي" }] }],
    }),
    targetAmount: 1000,
    currentAmount: 0,
    images: ["https://example.org/image.jpg"],
    videoUrl: "",
    categoryIds: [CATEGORY_ID],
    isActive: true,
    goalType: "FIXED",
    fundraisingMode: "AMOUNT",
    translations: {},
    ...overrides,
  };
}

const emptyExtras = {
  categoryPriorities: {},
  suggestedDonations: null,
  suggestedTeamSupport: null,
  suggestedShareCounts: null,
  shareLabels: null,
};

type MemoryState = {
  campaigns: CampaignPersistenceData[];
  translations: CampaignTranslationPersistenceData[];
};

function memoryDependencies(options: {
  categories?: Array<{ id: string; isActive: boolean | null }>;
  failLocale?: string;
  existingSlugs?: string[];
} = {}) {
  const state: MemoryState = { campaigns: [], translations: [] };
  const existingSlugs = new Set(options.existingSlugs ?? []);
  const categories = options.categories ?? [{ id: CATEGORY_ID, isActive: true }];

  return {
    state,
    dependencies: {
      transaction: async <T>(operation: (tx: CampaignCreateTransaction) => Promise<T>) => {
        const draft: MemoryState = {
          campaigns: [...state.campaigns],
          translations: [...state.translations],
        };
        const tx: CampaignCreateTransaction = {
          findCategories: async (ids) => categories.filter((category) => ids.includes(category.id)),
          generateCampaignSlug: async (base) => {
            const normalized = base.trim().replace(/\s+/g, "-");
            let candidate = normalized;
            let suffix = 2;
            while (existingSlugs.has(candidate)) candidate = `${normalized}-${suffix++}`;
            existingSlugs.add(candidate);
            return candidate;
          },
          generateTranslationSlug: async (locale, base) => `${base.trim().replace(/\s+/g, "-")}-${locale}`,
          createCampaign: async (data) => {
            draft.campaigns.push(data);
            return { id: `campaign-${draft.campaigns.length}`, title: data.title };
          },
          createTranslation: async (data) => {
            if (options.failLocale === data.locale) throw new Error(`translation ${data.locale} failed`);
            draft.translations.push(data);
          },
          getCreatedCampaign: async (campaignId) => ({
            id: campaignId,
            campaign: draft.campaigns.at(-1),
            translations: [...draft.translations],
          }),
        };
        const result = await operation(tx);
        state.campaigns = draft.campaigns;
        state.translations = draft.translations;
        return result;
      },
    },
  };
}

test("creates an Arabic-only campaign", async () => {
  const parsed = parseCampaignCreatePayload(validBody(), emptyExtras);
  const memory = memoryDependencies();
  await createCampaignCreator(memory.dependencies)(parsed);
  assert.equal(memory.state.campaigns.length, 1);
  assert.equal(memory.state.campaigns[0].title, "مشروع مياه");
  assert.equal(memory.state.translations.length, 0);
});

test("creates every supported translation supplied by the form", async () => {
  const translations = Object.fromEntries(
    ["en", "fr", "tr", "id", "pt", "es", "de"].map((locale) => [
      locale,
      {
        title: `Title ${locale}`,
        description: `Description ${locale}`,
        image: `https://example.org/${locale}.jpg`,
        videoUrl: `https://example.org/${locale}.mp4`,
      },
    ]),
  );
  const parsed = parseCampaignCreatePayload(validBody({ translations }), emptyExtras);
  const memory = memoryDependencies();
  await createCampaignCreator(memory.dependencies)(parsed);
  assert.deepEqual(
    memory.state.translations.map((translation) => translation.locale).sort(),
    ["de", "en", "es", "fr", "id", "pt", "tr"],
  );
});

test("rolls back the campaign when any translation fails", async () => {
  const parsed = parseCampaignCreatePayload(
    validBody({
      translations: {
        en: { title: "English", description: "English description" },
        fr: { title: "Français", description: "Description française" },
      },
    }),
    emptyExtras,
  );
  const memory = memoryDependencies({ failLocale: "fr" });
  await assert.rejects(createCampaignCreator(memory.dependencies)(parsed), /translation fr failed/);
  assert.equal(memory.state.campaigns.length, 0);
  assert.equal(memory.state.translations.length, 0);
});

test("rejects missing and inactive category IDs before creation", async () => {
  for (const categories of [
    [{ id: OTHER_CATEGORY_ID, isActive: true }],
    [{ id: CATEGORY_ID, isActive: false }],
  ]) {
    const parsed = parseCampaignCreatePayload(validBody(), emptyExtras);
    const memory = memoryDependencies({ categories });
    await assert.rejects(
      createCampaignCreator(memory.dependencies)(parsed),
      CampaignCreateValidationError,
    );
    assert.equal(memory.state.campaigns.length, 0);
  }
});

test("rejects an empty Arabic title and malformed category IDs", () => {
  assert.throws(
    () => parseCampaignCreatePayload(validBody({ title: "   " }), emptyExtras),
    /Arabic title is required/,
  );
  assert.throws(
    () => parseCampaignCreatePayload(validBody({ categoryIds: ["bad-id"] }), emptyExtras),
    /Invalid categoryId format/,
  );
});

test("generates a unique non-empty slug when titles collide", async () => {
  const parsed = parseCampaignCreatePayload(validBody({ slug: "same-title" }), emptyExtras);
  const memory = memoryDependencies({ existingSlugs: ["same-title"] });
  await createCampaignCreator(memory.dependencies)(parsed);
  assert.equal(memory.state.campaigns[0].slug, "same-title-2");
  assert.notEqual(memory.state.campaigns[0].slug, "");
});

test("mass-assigned fields never reach campaign persistence", async () => {
  const parsed = parseCampaignCreatePayload(
    validBody({
      id: "attacker-id",
      createdAt: "2000-01-01",
      donations: [{ amount: 999999 }],
      isDeleted: true,
      translations: { en: { title: "English", description: "Description" } },
    }),
    emptyExtras,
  );
  const memory = memoryDependencies();
  await createCampaignCreator(memory.dependencies)(parsed);
  const persisted = memory.state.campaigns[0] as unknown as Record<string, unknown>;
  assert.equal("id" in persisted, false);
  assert.equal("createdAt" in persisted, false);
  assert.equal("donations" in persisted, false);
  assert.equal("isDeleted" in persisted, false);
  assert.equal("translations" in persisted, false);
});

test("campaign creation permission allows ADMIN and campaigns STAFF only", () => {
  assert.equal(sessionHasDashboardPermission(sessionFor("ADMIN"), "campaigns"), true);
  assert.equal(
    sessionHasDashboardPermission(sessionFor("STAFF", ["campaigns"]), "campaigns"),
    true,
  );
  assert.equal(sessionHasDashboardPermission(sessionFor("STAFF", ["blog"]), "campaigns"), false);
  assert.equal(sessionHasDashboardPermission(sessionFor("DONOR"), "campaigns"), false);
});
