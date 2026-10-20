import { createHash, randomUUID } from "node:crypto";
import {
  CONFIG,
  fieldsFor,
  hasText,
  rows,
  statuses,
  text,
  validateChanges,
  valuesFor,
  type ContentKind,
  type ContentRecord,
  type TextValues,
} from "./contracts";

export interface Delegate {
  findUnique(args: object): Promise<ContentRecord | null>;
  findFirst(args: object): Promise<ContentRecord | null>;
  findMany(args: object): Promise<ContentRecord[]>;
  update(args: object): Promise<ContentRecord>;
  create(args: object): Promise<ContentRecord>;
  upsert(args: object): Promise<ContentRecord>;
}
export interface Store {
  model(name: string): Delegate;
  transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T>;
}
export class ContentError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function fingerprint(value: unknown): string {
  function stable(v: unknown): unknown {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, val]) => [k, stable(val)]),
      );
    return v;
  }
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}
export function includeFor(kind: ContentKind) {
  return {
    translations: true,
    ...(kind === "categories"
      ? {
          values: { include: { translations: true } },
          infoCards: { include: { translations: true } },
        }
      : {}),
    ...(kind === "super-categories"
      ? {
          blocks: {
            include: { translations: true },
            orderBy: { order: "asc" },
          },
          items: { orderBy: { order: "asc" } },
        }
      : {}),
  };
}
export async function readContent(db: Store, kind: ContentKind, id: string) {
  const row = await db
    .model(CONFIG[kind].model)
    .findUnique({ where: { id }, include: includeFor(kind) });
  if (!row) throw new ContentError("المحتوى غير موجود", 404);
  return row;
}
export function documentFor(kind: ContentKind, row: ContentRecord) {
  const base = valuesFor(kind, row, "ar");
  const locales = statuses(kind, row);
  const reviews =
    row.editorReviews && typeof row.editorReviews === "object"
      ? (row.editorReviews as Record<string, string>)
      : {};
  return {
    id: text(row.id),
    kind,
    title: text(row.title || row.name),
    slug: text(row.slug),
    revision: fingerprint(row),
    fields: fieldsFor(kind, row),
    source: base,
    values: Object.fromEntries(
      Object.keys(locales).map((locale) => [
        locale,
        valuesFor(kind, row, locale),
      ]),
    ),
    statuses: Object.fromEntries(
      Object.entries(locales).map(([locale, status]) => [
        locale,
        {
          ...status,
          reviewed:
            reviews[locale] ===
            fingerprint([base, valuesFor(kind, row, locale)]),
        },
      ]),
    ),
    previousSlugs: rows(row.slugChanges),
    settings: row,
  };
}
function dataFor(changes: TextValues) {
  return Object.fromEntries(
    Object.entries(changes).map(([key, value]) => [
      key,
      key === "amountLabels"
        ? value
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean)
        : value,
    ]),
  );
}
export async function saveContent(
  db: Store,
  input: {
    kind: ContentKind;
    id: string;
    locale: string;
    revision: string;
    changes: unknown;
    reviewed?: boolean;
  },
) {
  return db.transaction(async (tx) => {
    const { kind, id, locale } = input,
      cfg = CONFIG[kind];
    const row = await readContent(tx, kind, id);
    if (fingerprint(row) !== input.revision)
      throw new ContentError(
        "عدّل زميل هذا المحتوى. احتفظ بتعديلاتك ثم أعد تحميل النسخة الحالية.",
        409,
      );
    const changes = validateChanges(fieldsFor(kind, row), input.changes);
    const current = valuesFor(kind, row, locale),
      next = { ...current, ...changes };
    const titleKey = kind === "categories" ? "name" : "title";
    if (!hasText(next[titleKey]))
      throw new ContentError("العنوان مطلوب قبل الحفظ");
    // Touch the parent in the same transaction as every translation/child write.
    // A concurrent legacy form therefore conflicts with this save too.
    const reviews =
      row.editorReviews && typeof row.editorReviews === "object"
        ? { ...(row.editorReviews as Record<string, string>) }
        : {};
    if (input.reviewed)
      reviews[locale] = fingerprint([
        locale === "ar" ? next : valuesFor(kind, row, "ar"),
        next,
      ]);
    else delete reviews[locale];
    const parentChanges = Object.fromEntries(
      Object.entries(changes).filter(([key]) => !key.includes(".")),
    );
    await tx
      .model(cfg.model)
      .update({
        where: { id },
        data: {
          editorVersion: randomUUID(),
          editorReviews: reviews,
          ...(locale === "ar" ? dataFor(parentChanges) : {}),
        },
      });
    if (locale !== "ar" && Object.keys(parentChanges).length) {
      const key = `${cfg.parentKey}_locale`,
        where = { [key]: { [cfg.parentKey]: id, locale } };
      const data = dataFor(parentChanges);
      await tx
        .model(cfg.translationModel)
        .upsert({
          where,
          create: {
            [cfg.parentKey]: id,
            locale,
            [titleKey]: next[titleKey],
            ...(kind === "campaigns"
              ? { description: next.description || "" }
              : {}),
            ...data,
          },
          update: data,
        });
    }
    const childModels: Record<string, [string, string, string]> = {
      values: ["categoryValue", "categoryValueTranslation", "valueId"],
      infoCards: ["categoryInfoCard", "categoryInfoCardTranslation", "cardId"],
      blocks: [
        "superCategoryBlock",
        "superCategoryBlockTranslation",
        "blockId",
      ],
    };
    const grouped = new Map<string, TextValues>();
    for (const [key, value] of Object.entries(changes))
      if (key.includes(".")) {
        const [group, childId, field] = key.split("."),
          mapKey = `${group}.${childId}`;
        grouped.set(mapKey, { ...grouped.get(mapKey), [field]: value });
      }
    for (const [key, data] of grouped) {
      const [group, childId] = key.split("."),
        [model, translationModel, foreignKey] = childModels[group];
      if (locale === "ar")
        await tx.model(model).update({ where: { id: childId }, data });
      else {
        const required =
          group === "values" ? "label" : group === "infoCards" ? "title" : null;
        const full = Object.fromEntries(
          fieldsFor(kind, row)
            .filter((f) => f.key.startsWith(key + "."))
            .map((f) => [f.key.split(".")[2], next[f.key]]),
        );
        if (required && !hasText(full[required]))
          throw new ContentError("أكمل عنوان البطاقة أو القيمة قبل الحفظ");
        await tx
          .model(translationModel)
          .upsert({
            where: {
              [`${foreignKey}_locale`]: { [foreignKey]: childId, locale },
            },
            create: { [foreignKey]: childId, locale, ...full },
            update: data,
          });
      }
    }
    const saved = await readContent(tx, kind, id),
      actual = valuesFor(kind, saved, locale);
    if (
      Object.keys(changes).some((key) =>
        key === "amountLabels"
          ? text(actual[key]) !== text(dataFor(changes)[key])
          : actual[key] !== changes[key],
      )
    )
      throw new ContentError("لم تُحفظ كل الحقول. لم يُعتمد التعديل.", 500);
    return documentFor(kind, saved);
  });
}
export async function changeCategorySlug(
  db: Store,
  input: {
    id: string;
    revision: string;
    slug: string;
    confirmation: string;
    actor: string;
  },
) {
  const slug = input.slug.trim();
  if (
    !/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug) ||
    slug.length > 150 ||
    /^[a-f0-9]{24}$/i.test(slug)
  )
    throw new ContentError("استخدم حروفًا وأرقامًا وشرطات للرابط");
  if (input.confirmation !== slug)
    throw new ContentError("اكتب الرابط الجديد لتأكيد التغيير");
  return db.transaction(async (tx) => {
    const row = await readContent(tx, "categories", input.id);
    if (fingerprint(row) !== input.revision)
      throw new ContentError("تغير التصنيف. أعد تحميله أولًا.", 409);
    if (row.slug === slug) return documentFor("categories", row);
    const collision = await tx
      .model("category")
      .findFirst({
        where: {
          id: { not: input.id },
          OR: [
            { slug },
            { previousSlugs: { has: slug } },
            { translations: { some: { slug } } },
          ],
        },
      });
    if (collision)
      throw new ContentError("هذا الرابط مستخدم أو محفوظ لتصنيف آخر", 409);
    const previous = Array.isArray(row.previousSlugs)
      ? row.previousSlugs.filter((v): v is string => typeof v === "string")
      : [];
    if (row.slug) previous.push(text(row.slug));
    const history = [
      ...rows(row.slugChanges),
      {
        from: text(row.slug),
        to: slug,
        at: new Date().toISOString(),
        actor: input.actor,
      },
    ];
    await tx
      .model("category")
      .update({
        where: { id: input.id },
        data: {
          slug,
          previousSlugs: [...new Set(previous)].filter((v) => v !== slug),
          slugChanges: history,
          editorVersion: randomUUID(),
        },
      });
    return documentFor(
      "categories",
      await readContent(tx, "categories", input.id),
    );
  });
}
