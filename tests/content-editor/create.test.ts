import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspace, emptyWorkspace } from "../../lib/content-editor/create";
import { CONFIG, CONTENT_KINDS, type ContentRecord } from "../../lib/content-editor/contracts";
import type { Delegate, Store } from "../../lib/content-editor/service";

const id = "111111111111111111111111", creationKey = "11111111-1111-4111-8111-111111111111";
function database(failTranslation = false) {
  let tables: Record<string, ContentRecord[]> = {};
  const store: Store = {
    model(name) {
      const table = () => tables[name] ||= [];
      return {
        findUnique: async (args: { where: { id: string } }) => table().find((row) => row.id === args.where.id) || null,
        findFirst: async () => null,
        findMany: async () => table(),
        create: async (args: { data: ContentRecord }) => {
          const row = { ...args.data, id: args.data.id || id, translations: [] };
          table().push(row);
          return row;
        },
        update: async (args: { where: { id: string }; data: ContentRecord }) => {
          const row = table().find((row) => row.id === args.where.id);
          if (!row) throw new Error("Missing row");
          Object.assign(row, args.data); return row;
        },
        upsert: async (args: { create: ContentRecord; update: ContentRecord }) => {
          if (failTranslation) throw new Error("translation failed");
          const cfg = Object.values(CONFIG).find((cfg) => cfg.translationModel === name);
          if (!cfg) throw new Error("Unexpected upsert");
          const parent = tables[cfg.model].find((row) => row.id === args.create[cfg.parentKey]);
          if (!parent) throw new Error("Missing parent");
          const translations = parent.translations as ContentRecord[];
          const old = translations.find((row) => row.locale === args.create.locale);
          if (old) Object.assign(old, args.update); else translations.push({ ...args.create });
          return args.create;
        },
      } as unknown as Delegate;
    },
    async transaction(operation) {
      const before = structuredClone(tables);
      try { return await operation(store); }
      catch (error) { tables = before; throw error; }
    },
  };
  return { store, count: (name: string) => tables[name]?.length || 0 };
}
const input = () => ({
  kind: "blog" as const, creationKey, locale: "ar", changes: { title: "عنوان جديد", content: "نص المقال", description: "ملخص" },
  localeChanges: { en: { title: "New title", content: "Article body", description: "Summary" } },
});

test("new content starts unpublished with consistent language fields for all eleven types", () => {
  for (const kind of CONTENT_KINDS) {
    const row = emptyWorkspace(kind);
    assert.equal(row.id, "new");
    assert.equal(row.isActive, false);
    assert.deepEqual(row.translations, []);
  }
});
test("creation saves Arabic and translations together and retries return the same record", async () => {
  const db = database(), request = input();
  const saved = await createWorkspace(db.store, request);
  assert.equal(saved.values.ar.title, "عنوان جديد");
  assert.equal(saved.values.en.title, "New title");
  assert.equal(saved.settings.published, false);
  const retry = await createWorkspace(db.store, request);
  assert.equal(retry.id, saved.id);
  assert.equal(db.count("post"), 1);
  assert.equal(db.count("contentCreationRequest"), 1);
});
test("a translation failure rolls back the parent and creation key", async () => {
  const db = database(true);
  await assert.rejects(() => createWorkspace(db.store, input()), /translation failed/);
  assert.equal(db.count("post"), 0);
  assert.equal(db.count("contentCreationRequest"), 0);
});
test("reusing a creation key with edited input keeps the original and rejects a duplicate", async () => {
  const db = database(), request = input();
  await createWorkspace(db.store, request);
  await assert.rejects(() => createWorkspace(db.store, { ...request, changes: { ...request.changes, title: "Different" } }), /تم إنشاء المحتوى سابقًا/);
  assert.equal(db.count("post"), 1);
});
test("campaign creation rejects missing images and categories without writing money or content", async () => {
  const db = database();
  await assert.rejects(() => createWorkspace(db.store, { kind: "campaigns", creationKey, locale: "ar", changes: { title: "مشروع", description: "وصف المشروع" } }));
  assert.equal(db.count("campaign"), 0);
  assert.equal(db.count("contentCreationRequest"), 0);
});
