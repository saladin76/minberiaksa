import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG,
  fieldsFor,
  hasText,
  statuses,
  validateChanges,
  valuesFor,
  type ContentKind,
  type ContentRecord,
} from "../../lib/content-editor/contracts";
import {
  changeCategorySlug,
  documentFor,
  fingerprint,
  saveContent,
  type Delegate,
  type Store,
} from "../../lib/content-editor/service";
import {
  localizeContentHref,
  parseIstanbulSchedule,
  validateSectionLinks,
  validateSchedule,
} from "../../lib/content-editor/urls";
import { sessionHasDashboardPermission } from "../../lib/dashboard/permissions";
import type { Session } from "next-auth";
const id = "111111111111111111111111";
const rich = (value: string) =>
  JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: value }] }],
  });
function memory(kind: ContentKind, initial: ContentRecord) {
  let state = structuredClone(initial),
    fail = "",
    collision = false;
  const cfg = CONFIG[kind];
  const store: Store = {
    model(name) {
      const delegate = {
        async findUnique() {
          if (name === cfg.model) return structuredClone(state);
          return null;
        },
        async findFirst() {
          return collision ? { id: "other" } : null;
        },
        async findMany() {
          return [structuredClone(state)];
        },
        async update(args: { where: { id: string }; data: ContentRecord }) {
          if (fail === "update") throw new Error("offline");
          if (name === cfg.model) Object.assign(state, args.data);
          else {
            for (const group of ["values", "infoCards", "blocks"])
              for (const child of (state[group] as ContentRecord[]) || [])
                if (child.id === args.where.id) Object.assign(child, args.data);
          }
          return structuredClone(state);
        },
        async upsert(args: { create: ContentRecord; update: ContentRecord }) {
          if (fail === "upsert") throw new Error("translation write failed");
          if (name === cfg.translationModel) {
            const list = state.translations as ContentRecord[];
            const old = list.find((t) => t.locale === args.create.locale);
            if (old) Object.assign(old, args.update);
            else list.push(structuredClone(args.create));
          } else
            for (const group of ["values", "infoCards", "blocks"])
              for (const child of (state[group] as ContentRecord[]) || []) {
                const foreignKey =
                  group === "values"
                    ? "valueId"
                    : group === "infoCards"
                      ? "cardId"
                      : "blockId";
                if (child.id !== args.create[foreignKey]) continue;
                const list = child.translations as ContentRecord[];
                const old = list.find((t) => t.locale === args.create.locale);
                if (old) Object.assign(old, args.update);
                else list.push(structuredClone(args.create));
              }
          if (fail === "readback") state.translations = [];
          return {};
        },
        async create() {
          return {};
        },
      };
      return delegate as unknown as Delegate;
    },
    async transaction(fn) {
      const previous = structuredClone(state);
      try {
        return await fn(store);
      } catch (error) {
        state = previous;
        throw error;
      }
    },
  };
  return {
    store,
    read: () => structuredClone(state),
    fail: (value: string) => {
      fail = value;
    },
    collision: () => {
      collision = true;
    },
    legacyEdit: () => {
      state.description = "زميل عدّل النص";
    },
  };
}
const article = () => ({
  id,
  title: "عنوان",
  description: "ملخص",
  content: rich("نص المقال"),
  slug: "stable",
  editorVersion: null,
  editorReviews: null,
  translations: [
    {
      locale: "en",
      title: "Title",
      description: "Summary",
      content: rich("Article body"),
    },
  ],
});

test("empty HTML and Tiptap do not count as translated bodies", () => {
  for (const value of [
    "",
    "<p> &nbsp; </p>",
    rich("  "),
    rich("\n"),
    rich("\u200b"),
  ])
    assert.equal(hasText(value), false);
  assert.equal(hasText(rich("Body")), true);
});
test("a translated article title without a body remains incomplete", () => {
  const row = article();
  row.translations[0].content = rich("");
  assert.equal(statuses("blog", row).en.complete, false);
});
test("fallback source never counts as the target language", () => {
  const row = article();
  row.translations = [];
  assert.equal(valuesFor("blog", row, "fr").title, "");
  assert.equal(statuses("blog", row).fr.complete, false);
});
test("nested card and block copy participates in completion", () => {
  const row = {
    id,
    name: "تصنيف",
    description: "وصف",
    translations: [
      { locale: "en", name: "Category", description: "Description" },
    ],
    infoCards: [
      {
        id: "c",
        title: "عنوان",
        body: "نص",
        translations: [{ locale: "en", title: "Card" }],
      },
    ],
    values: [],
  };
  assert.equal(statuses("categories", row).en.complete, false);
  assert.ok(
    statuses("categories", row).en.missing.includes("infoCards.c.body"),
  );
});
test("SEO and editorial review are independent of content completion", () => {
  const doc = documentFor("blog", article());
  assert.equal(doc.statuses.en.complete, true);
  assert.equal(doc.statuses.en.seoComplete, false);
  assert.equal(doc.statuses.en.reviewed, false);
});
test("write allowlist rejects amounts, links, slugs and protected Arabic verses", () => {
  for (const key of [
    "targetAmount",
    "slug",
    "campaignId",
    "verseArabic",
    "ctaUrl",
    "__proto__",
  ])
    assert.throws(() =>
      validateChanges(fieldsFor("blog", article()), { [key]: "bad" }),
    );
});
test("saved rich content round-trips and all other locales survive", async () => {
  const db = memory("blog", article());
  const saved = await saveContent(db.store, {
    kind: "blog",
    id,
    locale: "fr",
    revision: fingerprint(db.read()),
    changes: {
      title: "Titre",
      content: rich("Texte français"),
      metaTitle: "Titre SEO",
      metaDescription: "Description SEO",
      imageAlt: "Photo",
    },
  });
  assert.equal(saved.values.fr.content, rich("Texte français"));
  assert.equal(saved.values.en.title, "Title");
  assert.equal(saved.slug, "stable");
});
test("concurrent legacy edits reject stale drafts before writing", async () => {
  const db = memory("blog", article()),
    revision = fingerprint(db.read());
  db.legacyEdit();
  const state = db.read();
  await assert.rejects(
    saveContent(db.store, {
      kind: "blog",
      id,
      locale: "en",
      revision,
      changes: { title: "Lost update" },
    }),
    { status: 409 },
  );
  assert.deepEqual(db.read(), state);
});
test("failed translation writes roll back parent and review markers", async () => {
  const db = memory("blog", article()),
    before = db.read();
  db.fail("upsert");
  await assert.rejects(
    saveContent(db.store, {
      kind: "blog",
      id,
      locale: "en",
      revision: fingerprint(before),
      changes: { title: "Changed" },
      reviewed: true,
    }),
  );
  assert.deepEqual(db.read(), before);
});
test("failed readback aborts the transaction instead of reporting success", async () => {
  const db = memory("blog", article()),
    before = db.read();
  db.fail("readback");
  await assert.rejects(
    saveContent(db.store, {
      kind: "blog",
      id,
      locale: "en",
      revision: fingerprint(before),
      changes: { title: "Changed" },
    }),
    { status: 500 },
  );
  assert.deepEqual(db.read(), before);
});
test("review markers are tied to both target text and source text", async () => {
  const db = memory("blog", article());
  let doc = await saveContent(db.store, {
    kind: "blog",
    id,
    locale: "en",
    revision: fingerprint(db.read()),
    changes: { title: "Title" },
    reviewed: true,
  });
  assert.equal(doc.statuses.en.reviewed, true);
  doc = await saveContent(db.store, {
    kind: "blog",
    id,
    locale: "ar",
    revision: doc.revision,
    changes: { title: "عنوان جديد" },
  });
  assert.equal(doc.statuses.en.reviewed, false);
});
test("nested translations save only to the owned child and round-trip", async () => {
  const row = {
    id,
    name: "تصنيف",
    translations: [{ locale: "en", name: "Category" }],
    values: [],
    infoCards: [{ id: "card1", title: "بطاقة", body: "نص", translations: [] }],
  };
  const db = memory("categories", row);
  const doc = await saveContent(db.store, {
    kind: "categories",
    id,
    locale: "en",
    revision: fingerprint(db.read()),
    changes: {
      "infoCards.card1.title": "Card",
      "infoCards.card1.body": "Body",
    },
  });
  assert.equal(doc.values.en["infoCards.card1.body"], "Body");
});
test("category links require typed confirmation", async () => {
  const db = memory("categories", {
    id,
    name: "Category",
    slug: "old",
    translations: [],
    values: [],
    infoCards: [],
    previousSlugs: [],
  });
  await assert.rejects(
    changeCategorySlug(db.store, {
      id,
      revision: fingerprint(db.read()),
      slug: "new",
      confirmation: "",
      actor: "editor",
    }),
  );
  assert.equal(db.read().slug, "old");
});
test("category link restore records a separate change and avoids redirect chains", async () => {
  const db = memory("categories", {
    id,
    name: "Category",
    slug: "old",
    translations: [],
    values: [],
    infoCards: [],
    previousSlugs: [],
  });
  let doc = await changeCategorySlug(db.store, {
    id,
    revision: fingerprint(db.read()),
    slug: "new",
    confirmation: "new",
    actor: "editor",
  });
  assert.deepEqual(db.read().previousSlugs, ["old"]);
  doc = await changeCategorySlug(db.store, {
    id,
    revision: doc.revision,
    slug: "old",
    confirmation: "old",
    actor: "editor",
  });
  assert.equal(doc.slug, "old");
  assert.deepEqual(db.read().previousSlugs, ["new"]);
  assert.equal(doc.previousSlugs.length, 2);
});
test("another category's live or reserved link cannot be claimed", async () => {
  const db = memory("categories", {
    id,
    name: "Category",
    slug: "old",
    translations: [],
    values: [],
    infoCards: [],
  });
  db.collision();
  await assert.rejects(
    changeCategorySlug(db.store, {
      id,
      revision: fingerprint(db.read()),
      slug: "reserved",
      confirmation: "reserved",
      actor: "editor",
    }),
    { status: 409 },
  );
});
test("banner labels preserve order and do not change amounts", async () => {
  const db = memory("urgent-banners", {
    id,
    title: "Banner",
    suggestedAmounts: [15, 750],
    amountLabels: ["مقعد", "حافلة"],
    translations: [],
  });
  const doc = await saveContent(db.store, {
    kind: "urgent-banners",
    id,
    locale: "en",
    revision: fingerprint(db.read()),
    changes: { title: "Banner", amountLabels: "Seat\nBus" },
  });
  assert.equal(doc.values.en.amountLabels, "Seat\nBus");
  assert.deepEqual(db.read().suggestedAmounts, [15, 750]);
});
test("localized URLs have a single locale prefix and preserve attribution", () => {
  assert.equal(
    localizeContentHref("/en/campaign/water?utm_source=ad#donate", "fr"),
    "/fr/campaign/water?utm_source=ad#donate",
  );
  assert.equal(localizeContentHref("#projects", "ar"), "#projects");
  assert.equal(
    localizeContentHref("https://example.org/x", "fr"),
    "https://example.org/x",
  );
  assert.equal(localizeContentHref("javascript:alert(1)", "ar"), "");
});
test("Istanbul schedule conversion is independent of the host timezone", () => {
  assert.equal(
    parseIstanbulSchedule("2026-10-20T10:30")?.toISOString(),
    "2026-10-20T07:30:00.000Z",
  );
  assert.equal(
    parseIstanbulSchedule("2026-10-20T07:30:00Z")?.toISOString(),
    "2026-10-20T07:30:00.000Z",
  );
  assert.throws(() => parseIstanbulSchedule("not-a-date"));
});
test("each of the five modules uses its own permission boundary", () => {
  for (const kind of Object.keys(CONFIG) as ContentKind[]) {
    const key = CONFIG[kind].permission;
    const session = {
      user: { id: "staff", role: "STAFF", dashboardPermissions: [key] },
    } as unknown as Session;
    assert.equal(sessionHasDashboardPermission(session, key), true);
    assert.equal(
      sessionHasDashboardPermission(
        {
          user: { role: "DONOR", dashboardPermissions: [key] },
        } as unknown as Session,
        key,
      ),
      false,
    );
  }
});
test("SEO never changes native public routing or amounts", async () => {
  const db = memory("campaigns", {
    id,
    title: "حملة",
    description: rich("وصف"),
    targetAmount: 20000,
    currentAmount: 3500,
    slug: "unchanged",
    translations: [],
  });
  const doc = await saveContent(db.store, {
    kind: "campaigns",
    id,
    locale: "ar",
    revision: fingerprint(db.read()),
    changes: {
      seoTitle: "عنوان البحث",
      seoDescription: "وصف البحث",
      imageAlt: "وصف الصورة",
    },
  });
  assert.equal(doc.values.ar.seoTitle, "عنوان البحث");
  assert.equal(db.read().slug, "unchanged");
  assert.equal(db.read().targetAmount, 20000);
});

test("a hero button cannot point to a hidden or missing section", () => {
  assert.ok(
    validateSectionLinks({
      ctaPrimaryHref: "#projects",
      blocks: [{ anchor: "projects", isActive: false }],
    }),
  );
  assert.equal(
    validateSectionLinks({
      ctaPrimaryHref: "#projects",
      blocks: [{ anchor: "projects", isActive: true }],
    }),
    null,
  );
  assert.ok(
    validateSectionLinks({ blocks: [{ anchor: "same" }, { anchor: "same" }] }),
  );
});
test("a banner end time must follow its start time", () => {
  assert.equal(
    validateSchedule(
      new Date("2026-10-20T10:00Z"),
      new Date("2026-10-20T09:00Z"),
    ),
    false,
  );
  assert.equal(validateSchedule(null, new Date()), true);
});
test("a copied Arabic translation is not counted as localized content", () => {
  const row = article();
  row.translations[0] = {
    locale: "en",
    title: row.title,
    description: row.description,
    content: row.content,
  };
  assert.equal(statuses("blog", row).en.complete, false);
});

test("legacy settings writes compare the version loaded with the form", async () => {
  const { contentWriteWhere } =
    await import("../../lib/content-editor/legacy-write");
  assert.deepEqual(
    contentWriteWhere({ id }, { expectedEditorVersion: "loaded-version" }),
    { id, AND: [{ OR: [{ editorVersion: "loaded-version" }] }] },
  );
  assert.deepEqual(contentWriteWhere({ id }, {}), { id });
  assert.throws(() => contentWriteWhere({ id }, { expectedEditorVersion: 1 }));
});
