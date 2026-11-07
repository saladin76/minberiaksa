import { applyProjectFilterOrder, type ProjectFilterOption } from "./project-filter-options";
import { miaPath, type MinbarRoute } from "./routes";

export type CatalogueNavigationRole = "gaza" | "aqsa" | "jerusalem" | "waqf" | "zakat" | "restoration" | "ibadan" | "recurring";
export type CatalogueNavigationLabels = Record<CatalogueNavigationRole, string>;

const DESTINATIONS: ReadonlyArray<{ role: CatalogueNavigationRole; aliases: readonly string[]; icon: string; route?: MinbarRoute }> = [
  { role: "gaza", aliases: ["region-gaza"], icon: "hand-heart" },
  { role: "aqsa", aliases: ["region-al-aqsa"], icon: "landmark" },
  { role: "jerusalem", aliases: ["region-al-quds"], icon: "home" },
  { role: "waqf", aliases: ["type-waqf"], icon: "landmark", route: "waqf" },
  { role: "zakat", aliases: ["type-zakat"], icon: "hand-coins", route: "zakat" },
  { role: "restoration", aliases: ["alquds-home-restoration", "al-quds-home-restoration"], icon: "home", route: "restorationProject" },
  { role: "ibadan", aliases: ["ibadan-lana"], icon: "book-open-check", route: "ibadanProject" },
  { role: "recurring", aliases: ["type-recurring"], icon: "calendar-heart", route: "recurring" },
];

/** Match CMS identities through base/previous slugs and retain saved ordering. */
export function buildCatalogueNavigation(
  locale: string,
  rows: readonly ProjectFilterOption[],
  savedOrder: unknown,
  labels: CatalogueNavigationLabels,
): ProjectFilterOption[] {
  const consumed = new Set<string>();
  const curated: ProjectFilterOption[] = [];
  for (const [order, destination] of DESTINATIONS.entries()) {
    const matches = rows.filter(row => {
      const kind = destination.role === "restoration" || destination.role === "ibadan" ? "programme" : "category";
      return row.kind === kind && [row.baseSlug || row.slug, ...row.previousSlugs || []].some(slug => destination.aliases.includes(slug));
    });
    const source = matches[0];
    const route = destination.route;
    // An unpublished category is not a functioning filter. Dedicated public
    // pages (including waqf) are available independently of category membership.
    if (!source && (!route || destination.role === "restoration" || destination.role === "ibadan")) continue;
    matches.forEach(row => consumed.add(row.key));
    const href = route
      ? destination.role === "restoration" || destination.role === "ibadan"
        ? miaPath("projectDetail", locale, encodeURIComponent(source?.slug || destination.aliases[0]))
        : miaPath(route, locale)
      : undefined;
    curated.push({
      ...source,
      key: route ? `page:${destination.role}` : source!.key,
      id: route ? destination.role : source!.id,
      kind: route ? "page" : source!.kind,
      name: source?.name || labels[destination.role],
      slug: source?.slug || destination.aliases[0],
      hashes: [...new Set(matches.flatMap(row => [row.key, row.slug, row.baseSlug || row.slug, ...row.previousSlugs || []]))],
      icon: destination.icon,
      order: source?.order ?? order,
      projectIds: [...new Set(matches.flatMap(row => row.projectIds))],
      ...(href ? { href } : {}),
    });
  }
  const extras = rows.filter(row => !consumed.has(row.key));
  const aliases = new Map(curated.flatMap(row => (row.hashes || []).map(hash => [hash, row.key])));
  const currentOrder = Array.isArray(savedOrder) ? savedOrder.map(key => aliases.get(key) || key) : undefined;
  // One shared order covers categories, major pages and dedicated static pages.
  // New CMS entries remain visible even before an administrator saves an order.
  return applyProjectFilterOrder([...curated, ...extras], currentOrder);
}
