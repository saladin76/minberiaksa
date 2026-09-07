import { prisma } from "@/lib/prisma";
import { getUserIdsMatchingBadge } from "@/lib/badge-criteria";
import {
  birthdateRangeForAges,
  genderQueryValues,
  parseGenderParam,
} from "@/lib/dashboard/user-demographics";

export interface DonorFilters {
  search?: string;
  preferredLang?: string;
  badgeId?: string;
  gender?: string;
  minAge?: number;
  maxAge?: number;
}

/**
 * Builds the same Prisma `where` clause the donors list page uses, so a
 * "send to currently filtered donors" action targets the exact same set.
 *
 * Returns null `where` when filters resolve to "no matches" (e.g. badge with
 * no members) — caller should treat as empty result.
 */
export async function buildDonorWhere(
  filters: DonorFilters
): Promise<Record<string, unknown> | null> {
  const where: Record<string, unknown> = { role: "DONOR" as const };

  if (filters.preferredLang) {
    where.preferredLang = filters.preferredLang;
  }

  const search = filters.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
    ];
  }

  // Kept in step with /api/users so «إرسال للنتائج المُصفّاة» reaches exactly
  // the rows the table is showing — a send that silently ignores the gender or
  // age filter would go to a much wider audience than the operator saw.
  const gender = parseGenderParam(filters.gender);
  if (gender) where.gender = { in: genderQueryValues(gender) };

  const birthdateRange = birthdateRangeForAges(
    filters.minAge ?? null,
    filters.maxAge ?? null
  );
  if (birthdateRange) where.birthdate = birthdateRange;

  if (filters.badgeId) {
    const badge = await prisma.badge.findUnique({
      where: { id: filters.badgeId },
      select: { criteria: true },
    });
    if (!badge) return null;
    const ids = await getUserIdsMatchingBadge(badge.criteria);
    if (ids.length === 0) return null;
    where.id = { in: ids };
  }

  return where;
}

/** Resolve a filter set to the donor IDs it would target. */
export async function resolveDonorIds(filters: DonorFilters): Promise<string[]> {
  const where = await buildDonorWhere(filters);
  if (!where) return [];
  const rows = await prisma.user.findMany({ where, select: { id: true } });
  return rows.map((r) => r.id);
}
