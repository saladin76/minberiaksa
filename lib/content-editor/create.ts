import { randomUUID } from "node:crypto";
import { CONFIG, fieldsFor, hasText, titleKeyFor, validateChanges, type ContentKind, type ContentRecord } from "./contracts";
import { ContentError, documentFor, fingerprint, generateEditorialSlug, reserveEditorialSlug, readContent, saveWorkspace, type Store } from "./service";
import { validateWorkspaceSettings } from "./workspace-settings";
import { parseCampaignCreatePayload, CampaignCreateValidationError } from "../campaign/admin-create-core";
import { generateUniqueSlug } from "../slug";
import { SUPPORTED_LOCALES } from "../locales";

export function emptyWorkspace(kind: ContentKind): ContentRecord {
  const shared = { id: "new", translations: [], editorReviews: {}, isActive: false, order: 0 };
  const defaults: Record<ContentKind, ContentRecord> = {
    campaigns: { title: "", description: "", images: [], categoryIds: [], goalType: "OPEN", fundraisingMode: "AMOUNT", targetAmount: 0, currentAmount: 0, baselineAmount: 0, updates: [] },
    categories: { name: "", campaignIds: [], currentAmount: 0, baselineAmount: 0, navigationVisible: true, pageTemplate: null, suggestedByCurrency: {}, heroImage: "", heroVideoUrl: "", statDoneValue: 0, statGoalValue: 0, donateToCategory: false, donateCampaignId: null, suggestedAmounts: [], achievementVideoIds: [], values: [], infoCards: [] },
    blog: { title: "", content: "", description: "", campaignIds: [], published: false },
    "super-categories": { title: "", heroVideoLocales: [], blocks: [], items: [] },
    "urgent-banners": { title: "", tone: "red", textSide: "start", priority: 0, locales: [], placements: [], suggestedAmounts: [], amountLabels: [] },
    videos: { title: "", type: "ACHIEVEMENT", localeFilter: [], showOnHome: false },
    playlists: { title: "", kind: "PROGRAM", videos: [] },
    courses: { title: "", kind: "COURSE", isPinned: false, isExternal: false, hasDetailPage: false, videos: [] },
    reports: { title: "", fileUrl: "", isPublished: false },
    booklets: { title: "", fileUrl: "", isPublished: false },
    faqs: { question: "", answer: "" },
  };
  return { ...shared, ...defaults[kind] };
}

export async function createWorkspace(db: Store, input: {
  kind: ContentKind; creationKey: string; locale: string; changes: unknown; localeChanges?: Record<string, unknown>; settings?: unknown;
}) {
  if (!/^[a-f0-9-]{36}$/i.test(input.creationKey)) throw new ContentError("أعد فتح نموذج الإنشاء");
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(input.locale) || Object.keys(input.localeChanges || {}).some((locale) => !(SUPPORTED_LOCALES as readonly string[]).includes(locale))) throw new ContentError("لغات غير صالحة");
  const requestFingerprint = fingerprint(input);
  return db.transaction(async (tx) => {
    const previous = await tx.model("contentCreationRequest").findUnique({ where: { id: input.creationKey } });
    if (previous) {
      if (previous.kind !== input.kind || previous.fingerprint !== requestFingerprint)
        throw new ContentError("تم إنشاء المحتوى سابقًا. افتحه قبل متابعة التعديل: /dashboard/content/" + previous.kind + "/" + previous.contentId, 409);
      return documentFor(input.kind, await readContent(tx, input.kind, String(previous.contentId)));
    }
    const kind = input.kind, cfg = CONFIG[kind], blank = emptyWorkspace(kind);
    const drafts = { ...input.localeChanges, [input.locale]: input.changes };
    const source = validateChanges(fieldsFor(kind, blank), drafts.ar || {});
    for (const field of cfg.fields.filter((field) => field.required))
      if (!hasText(source[field.key])) throw new ContentError("أكمل المحتوى العربي المطلوب: " + field.label);
    const settings = validateWorkspaceSettings(kind, blank, input.settings);
    const data: ContentRecord = { ...blank, ...source, ...settings, editorVersion: randomUUID() };
    for (const key of ["id", "translations", "updates", "blocks", "items", "videos", "values", "infoCards"]) delete data[key];
    if (["blog", "reports", "booklets"].includes(kind)) delete data.isActive;
    if (["campaigns", "blog", "urgent-banners"].includes(kind)) delete data.order;
    if (["reports", "booklets"].includes(kind)) source.fileUrl = String(data.fileUrl || "");
    if ("amountLabels" in data) data.amountLabels = String(data.amountLabels || "").split("\n").filter(Boolean);
    const titleKey = titleKeyFor(kind);
    const slug = ["campaigns", "categories", "blog", "super-categories"].includes(kind)
      ? await generateEditorialSlug(tx, kind, String(data[titleKey]), "000000000000000000000000")
      : kind === "faqs" ? undefined : await generateUniqueSlug({ findFirst: async (args) => { const found = await tx.model(cfg.model).findFirst(args); return found ? { id: String(found.id) } : null; } }, String(data[titleKey]));
    if (slug) data.slug = slug;
    if (kind === "campaigns") {
      const relation = settings.categories as { set: { id: string }[] } | undefined;
      const categoryIds = relation?.set.map((entry) => entry.id) || [];
      let parsed: ReturnType<typeof parseCampaignCreatePayload>;
      try { parsed = parseCampaignCreatePayload({ ...data, categoryIds, currentAmount: 0 }, {
        categoryPriorities: null, suggestedDonations: data.suggestedDonations || null,
        suggestedTeamSupport: null, suggestedShareCounts: data.suggestedShareCounts || null, shareLabels: null,
      }); } catch (error) {
        if (error instanceof CampaignCreateValidationError) {
          const labels: Record<string, string> = { images: "صور المشروع", categoryIds: "التصنيفات", targetAmount: "الهدف بالدولار", sharePriceUSD: "سعر السهم بالدولار", translations: "الترجمات", title: "العنوان", description: "المحتوى" };
          throw new ContentError("راجع بيانات المشروع المطلوبة: " + (labels[(error.field || "").split(".")[0]] || "المعلومات الأساسية"));
        }
        throw error;
      }
      const found = await tx.model("category").findMany({ where: { id: { in: parsed.categoryIds } } });
      if (found.length !== parsed.categoryIds.length || found.some((row) => row.isActive === false)) throw new ContentError("اختر تصنيفات نشطة موجودة");
      delete data.categoryIds;
      data.categories = { connect: parsed.categoryIds.map((id) => ({ id })) };
      data.currentAmount = 0; data.baselineAmount = 0;
    }
    if (["reports", "booklets"].includes(kind) && !hasText(data.fileUrl)) throw new ContentError("أضف ملف PDF أو رابطه قبل الإنشاء");
    if (kind === "videos" && !hasText(data.url) && !hasText(data.youtubeId)) throw new ContentError("أضف رابط الفيديو");
    if (kind === "urgent-banners" && (!Array.isArray(data.placements) || !data.placements.length)) throw new ContentError("اختر مكانًا واحدًا على الأقل يظهر فيه البانر");
    const created = await tx.model(cfg.model).create({ data });
    const id = String(created.id);
    if (slug && ["campaigns", "categories", "blog", "super-categories"].includes(kind)) await reserveEditorialSlug(tx, kind, slug, id);
    const row = await readContent(tx, kind, id);
    const saved = await saveWorkspace(tx, {
      kind, id, revision: fingerprint(row), locale: input.locale, changes: input.locale === "ar" ? source : input.changes,
      localeChanges: { ...input.localeChanges, ar: source },
      ...(["super-categories", "playlists", "courses", "categories"].includes(kind) ? { settings: input.settings } : {}),
    });
    await tx.model("contentCreationRequest").create({ data: { id: input.creationKey, kind, contentId: id, fingerprint: requestFingerprint } });
    return saved;
  });
}
