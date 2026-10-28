import { fieldsFor, validateChanges, type ContentKind, type ContentRecord } from "./contracts";
import { validateWorkspaceSettings } from "./workspace-settings";
import { isBlockKind, isItemKind } from "../content/super-category-write";
import { safeEditorUrl } from "./urls";
import type { PublicPreviewDraft } from "./public-preview";

export function preparePreviewDraft(kind: ContentKind, row: ContentRecord, locale: string, changes: unknown, input: unknown): PublicPreviewDraft {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? input as ContentRecord : {};
  const settings = validateWorkspaceSettings(kind, row, raw);
  for (const key of kind === "super-categories" ? ["blocks", "items"] : kind === "categories" ? ["values", "infoCards"] : []) {
    if (!(key in raw)) continue;
    if (!Array.isArray(raw[key]) || raw[key].length > 100) throw new Error("قائمة معاينة غير صالحة");
    settings[key] = raw[key].map((value, index) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("صف معاينة غير صالح");
      const item = value as ContentRecord;
      if (key === "items") {
        if (!isItemKind(item.kind) || typeof item.refId !== "string" || !/^[a-f0-9]{24}$/i.test(item.refId)) throw new Error("رابط محتوى غير صالح");
        return { kind: item.kind, refId: item.refId, order: index };
      }
      const id = String(item.id || `draft-${index}`);
      if (!/^[\w-]{1,80}$/.test(id)) throw new Error("معرف معاينة غير صالح");
      const previous = Array.isArray(row[key]) ? (row[key] as ContentRecord[]).find(entry => entry.id === id) : undefined;
      const result: ContentRecord = { ...previous, id };
      const keys = key === "blocks" ? ["kind", "anchor", "linkUrl", "image", "youtubeId", "refId", "maxItems", "isActive"] : key === "values" ? ["label"] : ["icon", "title", "body"];
      for (const field of keys) {
        const value = item[field];
        if (field === "kind") { if (!isBlockKind(value)) throw new Error("نوع قسم غير صالح"); result.kind = value; }
        else if (field === "isActive") { if (typeof value !== "boolean") throw new Error("حالة غير صالحة"); result[field] = value; }
        else if (field === "maxItems") { if (value != null && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 100)) throw new Error("عدد غير صالح"); result[field] = value ?? null; }
        else {
          if (value != null && (typeof value !== "string" || value.length > 20000)) throw new Error("قيمة معاينة غير صالحة");
          if (["linkUrl", "image"].includes(field) && value && !safeEditorUrl(String(value))) throw new Error("وجهة غير آمنة");
          if (field === "refId" && value && !/^[a-f0-9]{24}$/i.test(String(value))) throw new Error("مرجع غير صالح");
          result[field] = value ?? "";
        }
      }
      return result;
    });
  }
  return { locale, settings, changes: validateChanges(fieldsFor(kind, { ...row, ...settings }), changes) };
}
