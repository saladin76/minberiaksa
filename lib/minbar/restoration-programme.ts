import { prisma } from "@/lib/prisma";
import { programmeProjectIds } from "./project-filter-options";

const SLUGS = ["al-quds-home-restoration", "alquds-home-restoration"];

/** The established donation page and the CMS programme have distinct slugs.
 * Share the programme's project selection with that donation page, preserving
 * its checkout and advertising URL. No production database id is hardcoded. */
export async function getRestorationProgrammeProjectIds(): Promise<string[] | undefined> {
  const matches = await prisma.superCategory.findMany({
    where: { isActive: true, OR: [
      { slug: { in: SLUGS } }, { previousSlugs: { hasSome: SLUGS } },
      { translations: { some: { slug: { in: SLUGS } } } },
    ] },
    select: {
      items: { orderBy: [{ order: "asc" }, { id: "asc" }], select: { kind: true, refId: true } },
      blocks: { select: { kind: true, isActive: true, maxItems: true } },
    },
    take: 2,
  });
  if (matches.length > 1) throw new Error("RESTORATION_PROGRAMME_ROUTE_AMBIGUOUS");
  const row = matches[0];
  return row ? programmeProjectIds(row.items, row.blocks, new Set(row.items.map(item => item.refId))) : undefined;
}
