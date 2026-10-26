import { SUPPORTED_LOCALES } from "../locales";
import { pickLocaleSlug } from "../slug";
import { CONFIG, rows, text, valuesFor, type ContentKind } from "./contracts";
import { changeEditorialSlug, ContentError, documentFor, fingerprint, readContent, type Store } from "./service";

/** One transaction for every selected locale; existing aliases remain valid. */
export async function changeEditorialSlugs(db: Store, input: {
  kind: ContentKind; id: string; revision: string; changes: unknown; confirmation: string; actor: string;
}) {
  if (!["campaigns", "categories", "blog", "super-categories"].includes(input.kind)) throw new ContentError("هذا المحتوى لا يملك رابطًا مستقلًا");
  if (input.confirmation !== "UPDATE_SLUGS" || !input.changes || typeof input.changes !== "object" || Array.isArray(input.changes)) throw new ContentError("راجع الروابط وأكد التغيير أولًا");
  const changes = input.changes as Record<string, unknown>;
  const locales = Object.keys(changes);
  if (!locales.length || locales.some(locale => !(SUPPORTED_LOCALES as readonly string[]).includes(locale) || typeof changes[locale] !== "string")) throw new ContentError("اختر لغات وروابط صالحة");
  return db.transaction(async tx => {
    const row = await readContent(tx, input.kind, input.id);
    if (fingerprint(row) !== input.revision) throw new ContentError("تغير المحتوى. أعد تحميله أولًا.", 409);
    const before = documentFor(input.kind, row);
    const translations = rows(row.translations) as { locale: string; slug?: string | null }[];
    const projected = translations.map(entry => ({ ...entry, ...(typeof changes[entry.locale] === "string" ? { slug: String(changes[entry.locale]).trim() } : {}) }));
    if (typeof changes.en === "string" && !projected.some(entry => entry.locale === "en")) projected.push({ locale: "en", slug: changes.en.trim() });
    // A locale with no own slug inherits English or Arabic. Pin its CURRENT URL
    // if changing the fallback would otherwise change an excluded language too.
    for (const locale of SUPPORTED_LOCALES) {
      if (locale === "ar" || locale in changes) continue;
      const after = pickLocaleSlug(typeof changes.ar === "string" ? changes.ar.trim() : text(row.slug), projected, locale) || input.id;
      if (after === before.slugs[locale]) continue;
      const cfg = CONFIG[input.kind], own = valuesFor(input.kind, row, locale);
      await tx.model(cfg.translationModel).upsert({
        where: { [cfg.parentKey + "_locale"]: { [cfg.parentKey]: input.id, locale } },
        create: { [cfg.parentKey]: input.id, locale, [input.kind === "categories" ? "name" : "title"]: own[input.kind === "categories" ? "name" : "title"] || "", ...(input.kind === "campaigns" ? { description: own.description || "" } : {}), slug: before.slugs[locale] },
        update: { slug: before.slugs[locale] },
      });
    }
    const joined: Store = { model: name => tx.model(name), transaction: fn => fn(tx) };
    // Write fallback sources first, then explicit per-language choices.
    for (const locale of [...SUPPORTED_LOCALES].sort((a, b) => (a === "ar" ? -2 : a === "en" ? -1 : 0) - (b === "ar" ? -2 : b === "en" ? -1 : 0))) {
      if (!(locale in changes)) continue;
      const slug = String(changes[locale]).trim();
      const current = await readContent(tx, input.kind, input.id);
      await changeEditorialSlug(joined, { ...input, revision: fingerprint(current), locale, slug, confirmation: slug });
    }
    return documentFor(input.kind, await readContent(tx, input.kind, input.id));
  });
}
