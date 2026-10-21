import type { Store } from "./service";
import type { ContentKind, ContentRecord } from "./contracts";
import { safeEditorUrl } from "./workspace-settings";
import { validateSectionLinks } from "./urls";
import { HAS_IMPACT_BACKING_CAMPAIGNS } from "./site-capabilities";
const validId = (v: unknown) =>
  typeof v === "string" && /^[a-f0-9]{24}$/i.test(v);
const kinds = [
  "CAMPAIGNS",
  "POSTS",
  "VIDEOS",
  "PLAYLISTS",
  "COURSES",
  "REPORTS",
  "BOOKLETS",
  "TEXT",
  "VIDEO",
  "PLAYLIST_EPISODES",
];
export async function saveWorkspaceRelations(
  db: Store,
  kind: ContentKind,
  id: string,
  row: ContentRecord,
  input: unknown,
) {
  if (kind !== "super-categories" || !input || typeof input !== "object")
    return;
  const settings = input as ContentRecord;
  if (
    Object.keys(settings).some(
      (key) =>
        key === "blocks" || /^cta(?:Primary|Secondary|Tertiary)Href$/.test(key),
    )
  ) {
    const error = validateSectionLinks({ ...row, ...settings });
    if (error) throw new Error(error);
  }
  if ("blocks" in settings) {
    if (!Array.isArray(settings.blocks) || settings.blocks.length > 60)
      throw new Error("أقسام الصفحة غير صالحة");
    const old = Array.isArray(row.blocks)
      ? (row.blocks as ContentRecord[])
      : [];
    const kept = new Set<string>();
    const blocks = settings.blocks as ContentRecord[];
    const linksError = validateSectionLinks({ ...row, ...settings });
    if (linksError) throw new Error(linksError);
    for (let order = 0; order < blocks.length; order++) {
      const b = blocks[order];
      if (!b || !kinds.includes(String(b.kind)))
        throw new Error("نوع قسم غير صالح");
      if (
        b.id &&
        (!validId(b.id) ||
          !old.some((v) => v.id === b.id) ||
          kept.has(String(b.id)))
      )
        throw new Error("القسم لا ينتمي لهذه الصفحة");
      if (b.id) kept.add(String(b.id));
      const data: ContentRecord = {
        kind: b.kind,
        order,
        isActive: b.isActive !== false,
      };
      for (const key of ["anchor", "linkUrl", "image", "youtubeId", "refId"]) {
        if (typeof b[key] !== "string" || String(b[key]).length > 2048)
          throw new Error("إعداد قسم غير صالح");
        if (
          ["linkUrl", "image"].includes(key) &&
          !safeEditorUrl(String(b[key]))
        )
          throw new Error("رابط القسم غير صالح");
        if (key === "refId" && b[key] && !validId(b[key]))
          throw new Error("مرجع قسم غير صالح");
        if (
          key === "anchor" &&
          b[key] &&
          !/^[A-Za-z][\w-]*$/.test(String(b[key]))
        )
          throw new Error("معرّف الارتساء غير صالح");
        data[key] = b[key] || null;
      }
      const max =
        b.maxItems == null || b.maxItems === "" ? null : Number(b.maxItems);
      if (max !== null && (!Number.isInteger(max) || max < 1 || max > 200))
        throw new Error("عدد العناصر غير صالح");
      data.maxItems = max;
      if (
        b.kind === "VIDEO" &&
        b.youtubeId &&
        !/^[A-Za-z0-9_-]{11}$/.test(String(b.youtubeId))
      )
        throw new Error("معرّف فيديو القسم غير صالح");
      if (
        b.kind === "PLAYLIST_EPISODES" &&
        (!b.refId ||
          !(await db
            .model("videoPlaylist")
            .findUnique({ where: { id: b.refId }, select: { id: true } })))
      )
        throw new Error("اختر سلسلة موجودة لهذا القسم");
      if (b.id)
        await db
          .model("superCategoryBlock")
          .update({ where: { id: b.id }, data });
      else
        await db.model("superCategoryBlock").create({
          data: {
            ...data,
            superCategoryId: id,
            title:
              typeof b.title === "string" ? b.title.slice(0, 200) : "قسم جديد",
          },
        });
    }
    const removed = old.filter((v) => !kept.has(String(v.id))).map((v) => v.id);
    if (removed.length) {
      const delegate = db.model("superCategoryBlock");
      if (!delegate.deleteMany) throw new Error("تعذر حذف القسم");
      await delegate.deleteMany({
        where: { superCategoryId: id, id: { in: removed } },
      });
    }
  }
  if ("items" in settings) {
    if (!Array.isArray(settings.items) || settings.items.length > 300)
      throw new Error("المحتوى المرتبط غير صالح");
    const modelNames: Record<string, string> = {
      CAMPAIGN: "campaign",
      POST: "post",
      VIDEO: "video",
      PLAYLIST: "videoPlaylist",
      COURSE: "course",
      REPORT: "report",
      BOOKLET: "booklet",
    };
    const seen = new Set<string>();
    for (const item of settings.items as ContentRecord[]) {
      if (!item || !modelNames[String(item.kind)] || !validId(item.refId))
        throw new Error("مرجع محتوى غير صالح");
      const key = item.kind + ":" + item.refId;
      if (seen.has(key)) throw new Error("محتوى مكرر");
      seen.add(key);
      const linked = await db
        .model(modelNames[String(item.kind)])
        .findUnique({ where: { id: item.refId } });
      if (!linked || (item.kind === "CAMPAIGN" && linked.isDeleted))
        throw new Error("محتوى مرتبط غير موجود");
      if (
        item.kind === "CAMPAIGN" &&
        HAS_IMPACT_BACKING_CAMPAIGNS &&
        (await db
          .model("impactCampaign")
          .findFirst({
            where: { campaignId: item.refId },
            select: { id: true },
          }))
      )
        throw new Error("سجلات تسوية الأثر ليست محتوى للربط");
    }
    const delegate = db.model("superCategoryItem");
    if (!delegate.deleteMany) throw new Error("تعذر تحديث المحتوى المرتبط");
    await delegate.deleteMany({ where: { superCategoryId: id } });
    for (const [order, item] of (settings.items as ContentRecord[]).entries())
      await delegate.create({
        data: {
          superCategoryId: id,
          kind: item.kind,
          refId: item.refId,
          order,
        },
      });
  }
}
