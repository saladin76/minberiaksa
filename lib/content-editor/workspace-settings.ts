import { settingsFields } from "./workspace";
import { SUPPORTED_LOCALES } from "../locales";
import { parseIstanbulSchedule, validateSchedule, safeEditorUrl } from "./urls";
export { safeEditorUrl } from "./urls";
import type { ContentKind, ContentRecord } from "./contracts";
import { BANNER_PAGES } from "../minbar/banner-placements";
export function validateWorkspaceSettings(
  kind: ContentKind,
  row: ContentRecord,
  input: unknown,
): ContentRecord {
  if (input === undefined) return {};
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("إعدادات غير صالحة");
  const result: ContentRecord = {};
  for (const [key, value] of Object.entries(input)) {
    const spec = settingsFields(kind, row).find((f) => f.key === key);
    if (kind === "super-categories" && ["blocks", "items"].includes(key))
      continue;
    if (!spec) throw new Error("إعداد غير مسموح: " + key);
    if (spec.type === "boolean") {
      if (typeof value !== "boolean") throw new Error("قيمة التفعيل غير صالحة");
      result[key] = value;
    } else if (spec.type === "number") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1e9
      )
        throw new Error("قيمة مالية أو ترتيب غير صالح");
      if (
        ["order", "priority", "statDoneValue", "statGoalValue"].includes(key) &&
        !Number.isInteger(value)
      )
        throw new Error("الترتيب يجب أن يكون عددًا صحيحًا");
      result[key] = value;
    } else if (
      ["images", "numbers"].includes(spec.type) ||
      [
        "categoryIds",
        "campaignIds",
        "locales",
        "placements",
        "heroVideoLocales",
        "achievementVideoIds",
      ].includes(key)
    ) {
      if (!Array.isArray(value) || value.length > 100)
        throw new Error("قائمة غير صالحة");
      if (
        spec.type === "numbers" &&
        value.some(
          (v) =>
            typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 1e9,
        )
      )
        throw new Error("المبالغ المقترحة غير صالحة");
      if (
        spec.type !== "numbers" &&
        value.some((v) => typeof v !== "string" || v.length > 2048)
      )
        throw new Error("قائمة غير صالحة");
      if (
        spec.type === "images" &&
        value.some((v) => !safeEditorUrl(String(v)))
      )
        throw new Error("رابط صورة غير صالح");
      if (
        ["categoryIds", "campaignIds", "achievementVideoIds"].includes(key) &&
        value.some((v) => !/^[a-f0-9]{24}$/i.test(String(v)))
      )
        throw new Error("معرّف غير صالح");
      if (
        ["locales", "heroVideoLocales"].includes(key) &&
        value.some(
          (v) => !(SUPPORTED_LOCALES as readonly string[]).includes(String(v)),
        )
      )
        throw new Error("لغة غير مفعلة");
      if (
        key === "placements" &&
        value.some(
          (v) =>
            !BANNER_PAGES.some((p) =>
              p.slots.some((s) => `${p.key}:${s.key}` === v),
            ),
        )
      )
        throw new Error("موضع غير صالح");
      if (key === "campaignIds" && value.length > 3)
        throw new Error("اختر ثلاثة مشاريع على الأكثر");
      if (
        kind === "categories" &&
        key === "suggestedAmounts" &&
        value.some((v) => !Number.isInteger(v))
      )
        throw new Error("مبالغ صندوق التصنيف أعداد صحيحة موجبة");
      result[key] = [...new Set(value)];
    } else {
      if (typeof value !== "string" || value.length > 2048)
        throw new Error("قيمة إعداد غير صالحة");
      if (spec.options && !spec.options.some(([k]) => k === value))
        throw new Error("خيار غير صالح");
      if (key === "heroVideoId" && value && !/^[A-Za-z0-9_-]{11}$/.test(value))
        throw new Error("معرّف فيديو YouTube غير صالح");
      if (
        key === "heroVideoUrl" &&
        value &&
        !/^[A-Za-z0-9_-]{11}$/.test(value) &&
        (!/^https?:\/\//.test(value) || !safeEditorUrl(value))
      )
        throw new Error("رابط فيديو الواجهة غير صالح");
      if (
        key === "accentColor" &&
        value &&
        !/^#[a-f0-9]{3}(?:[a-f0-9]{3})?$/i.test(value)
      )
        throw new Error("استخدم لونًا بصيغة #RRGGBB");
      if (["url", "image"].includes(spec.type) && !safeEditorUrl(value))
        throw new Error("وجهة غير آمنة");
      if (
        ["categoryId", "campaignId", "donateCampaignId"].includes(key) &&
        value &&
        !/^[a-f0-9]{24}$/i.test(value)
      )
        throw new Error("معرّف غير صالح");
      if (spec.type === "date") {
        const parsed = value ? parseIstanbulSchedule(value) : null;
        if (value && !parsed) throw new Error("موعد غير صالح");
        result[key] = parsed;
      } else
        result[key] =
          value ||
          ([
            "categoryId",
            "campaignId",
            "donateCampaignId",
            "sharePriceUSD",
          ].includes(key)
            ? null
            : "");
    }
  }
  const next = { ...row, ...result };
  if (kind === "campaigns") {
    for (const [key, nativeKey, arrayKey] of [
      ["defaultDonationAmounts", "suggestedDonations", "amounts"],
      ["defaultShareCounts", "suggestedShareCounts", "counts"],
    ]) {
      if (key in result) {
        const values = result[key] as number[];
        if (
          !values.length ||
          values.length > 20 ||
          (key === "defaultShareCounts" &&
            values.some((v) => !Number.isInteger(v) || v > 1000000))
        )
          throw new Error("أضف من قيمة إلى عشرين قيمة مقترحة صالحة");
        const previous = row[nativeKey];
        result[nativeKey] = {
          ...(previous &&
          typeof previous === "object" &&
          !Array.isArray(previous)
            ? previous
            : {}),
          [arrayKey]: values,
        };
        delete result[key];
      }
    }
    if (
      row.fundraisingMode === "IMPACT" &&
      Object.keys(result).some((k) =>
        [
          "goalType",
          "targetAmount",
          "fundraisingMode",
          "sharePriceUSD",
        ].includes(k),
      )
    )
      throw new Error("إعدادات تبرع مشاريع الأثر تُدار من محرر الأثر المتخصص");
    if (result.isActive === true && row.editorArchived === true)
      result.editorArchived = false;
    if (next.goalType === "FIXED" && Number(next.targetAmount) < 1)
      throw new Error("أضف هدفًا أكبر من صفر");
    if (next.fundraisingMode === "SHARES" && Number(next.sharePriceUSD) <= 0)
      throw new Error("أضف سعر السهم");
    if (next.goalType === "OPEN" && "goalType" in result)
      result.targetAmount = 0;
    if ("categoryIds" in result) {
      const ids = result.categoryIds as string[];
      if (!ids.length) throw new Error("اختر تصنيفًا واحدًا على الأقل");
      delete result.categoryIds;
      result.categories = { set: ids.map((id) => ({ id })) };
    }
  }
  if (
    kind === "urgent-banners" &&
    !validateSchedule(
      next.startsAt ? new Date(String(next.startsAt)) : null,
      next.endsAt ? new Date(String(next.endsAt)) : null,
    )
  )
    throw new Error("نهاية الظهور يجب أن تكون بعد البداية");
  return result;
}
