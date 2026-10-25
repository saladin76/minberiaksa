import type { Store } from "./service";
import { rows, text, type ContentRecord } from "./contracts";
import { SUPPORTED_LOCALES } from "../locales";
import { parseCategoryValues, parseCategoryCards, cardIcon } from "../content/category-page-write";

function newChild(item: ContentRecord, card: boolean) {
  const keys = card ? ["title", "body"] : ["label"], required = keys[0];
  if (!text(item[required]).trim()) throw new Error("أكمل عنوان العنصر الجديد بالعربية");
  for (const key of keys) if (typeof item[key] !== "string" || String(item[key]).length > (key === "body" ? 5000 : 500)) throw new Error("نص العنصر غير صالح");
  if (item.translations !== undefined) {
    if (!item.translations || typeof item.translations !== "object" || Array.isArray(item.translations)) throw new Error("ترجمات العنصر غير صالحة");
    for (const [locale, value] of Object.entries(item.translations)) {
      if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale) || locale === "ar" || !value || typeof value !== "object" || Array.isArray(value)) throw new Error("لغة العنصر غير صالحة");
      const translation = value as ContentRecord;
      if (keys.some((key) => typeof translation[key] !== "string" || String(translation[key]).length > (key === "body" ? 5000 : 500))) throw new Error("نص ترجمة العنصر غير صالح");
      if (keys.some((key) => text(translation[key]).trim()) && !text(translation[required]).trim()) throw new Error("أكمل عنوان ترجمة العنصر");
    }
  }
  const parsed = card ? parseCategoryCards([item]) : parseCategoryValues([item]);
  if (!parsed?.[0]) throw new Error("عنصر جديد غير صالح");
  return parsed[0];
}
export async function saveCategoryStructures(db: Store, id: string, original: ContentRecord, settings: ContentRecord) {
  for (const [group, model, translationModel, parentKey] of [
    ["values", "categoryValue", "categoryValueTranslation", "valueId"],
    ["infoCards", "categoryInfoCard", "categoryInfoCardTranslation", "cardId"],
  ]) {
    if (!(group in settings)) continue;
    const items = settings[group]; if (!Array.isArray(items) || items.length > 20) throw new Error("قائمة عناصر التصنيف غير صالحة");
    const previous = rows(original[group]), kept = new Set<string>();
    for (const [order, raw] of items.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("عنصر تصنيف غير صالح");
      const item = raw as ContentRecord;
      if (item.id) {
        if (typeof item.id !== "string" || !/^[a-f0-9]{24}$/i.test(item.id) || !previous.some((old) => old.id === item.id) || kept.has(item.id)) throw new Error("عنصر التصنيف لا ينتمي لهذه الصفحة");
        // Text and translations of existing children are saved through the common text draft.
        await db.model(model).update({ where: { id: item.id }, data: { order, ...(group === "infoCards" ? { icon: cardIcon(item.icon) } : {}) } });
        kept.add(item.id);
      } else {
        const data = newChild(item, group === "infoCards");
        const created = await db.model(model).create({ data: { ...data, categoryId: id, order } });
        kept.add(text(created.id));
      }
    }
    const removed = previous.filter((item) => !kept.has(text(item.id))).map((item) => item.id);
    if (removed.length) {
      const translations = db.model(translationModel), children = db.model(model);
      if (!translations.deleteMany || !children.deleteMany) throw new Error("تعذر تحديث عناصر التصنيف");
      await translations.deleteMany({ where: { [parentKey]: { in: removed } } });
      await children.deleteMany({ where: { id: { in: removed }, categoryId: id } });
    }
  }
}
