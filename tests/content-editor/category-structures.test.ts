import test from "node:test";
import assert from "node:assert/strict";
import { saveCategoryStructures } from "../../lib/content-editor/category-structures";
import { validateWorkspaceSettings } from "../../lib/content-editor/workspace-settings";
import type { Store, Delegate } from "../../lib/content-editor/service";
import type { ContentRecord } from "../../lib/content-editor/contracts";
const categoryId = "111111111111111111111111", childId = "222222222222222222222222";
function mock() {
  const calls: Array<{ model: string; action: string; args: ContentRecord }> = [];
  const store = { model: (model: string) => ({
    update: async (args: ContentRecord) => { calls.push({ model, action: "update", args }); return {}; },
    create: async (args: ContentRecord) => { calls.push({ model, action: "create", args }); return { id: childId }; },
    deleteMany: async (args: ContentRecord) => { calls.push({ model, action: "deleteMany", args }); return {}; },
  } as unknown as Delegate) } as unknown as Store;
  return { store, calls };
}
test("reordering existing category cards never overwrites their independently edited text", async () => {
  const { store, calls } = mock();
  await saveCategoryStructures(store, categoryId, { infoCards: [{ id: childId, title: "Original" }] }, { infoCards: [{ id: childId, title: "Stale copy", body: "Stale body", icon: "water" }] });
  assert.deepEqual(calls[0].args.data, { order: 0, icon: "water" });
});
test("new category items save their Arabic and locale copies in the same child write", async () => {
  const { store, calls } = mock();
  await saveCategoryStructures(store, categoryId, { values: [] }, { values: [{ label: "قيمة", translations: { en: { label: "Value" }, tr: { label: "Değer" } } }] });
  const data = calls[0].args.data as ContentRecord;
  assert.equal(data.categoryId, categoryId);
  assert.equal(data.label, "قيمة");
  assert.deepEqual(data.translations, { create: [{ locale: "en", label: "Value" }, { locale: "tr", label: "Değer" }] });
});
test("foreign child identifiers cannot update or remove another category's elements", async () => {
  const { store, calls } = mock();
  await assert.rejects(() => saveCategoryStructures(store, categoryId, { values: [] }, { values: [{ id: childId, label: "Other" }] }), /لا ينتمي/);
  assert.equal(calls.length, 0);
});
test("category currency overrides reject negatives and duplicate currencies and preserve local units", () => {
  const row = { suggestedByCurrency: {} };
  assert.deepEqual(validateWorkspaceSettings("categories", row, { currencyOverrides: [{ currency: "TRY", amountsStr: "١٠٠, ٢٠٠" }] }), { suggestedByCurrency: { TRY: [100, 200] } });
  assert.throws(() => validateWorkspaceSettings("categories", row, { currencyOverrides: [{ currency: "TRY", amountsStr: "-10, 20" }] }));
  assert.throws(() => validateWorkspaceSettings("categories", row, { currencyOverrides: [{ currency: "EUR", amountsStr: "10" }, { currency: "EUR", amountsStr: "20" }] }));
});
