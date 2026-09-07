// Helpers for the Campaign ↔ Category many-to-many relation.
//
// The schema stores `categoryIds: String[]` on Campaign (mirrored as `campaignIds`
// on Category, managed implicitly by Prisma). Per-category ordering lives in
// `categoryPriorities` as `{ [categoryId]: number }` — lower number = higher
// priority on that category's page; absent key = unprioritized for that category.

import type { Prisma } from "@prisma/client";

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/**
 * Coerce a request body's category payload into a unique, validated ObjectId
 * array. Accepts:
 *  - `categoryIds: string[]` (preferred)
 *  - `categoryId: string`     (legacy single-category callers)
 *
 * Returns null if no valid id is supplied (caller decides whether that's an error).
 */
export function normalizeCategoryIdsInput(body: {
  categoryIds?: unknown;
  categoryId?: unknown;
}): string[] | null {
  const out = new Set<string>();
  if (Array.isArray(body.categoryIds)) {
    for (const v of body.categoryIds) {
      if (typeof v === "string" && OBJECT_ID_RE.test(v)) out.add(v);
    }
  }
  if (typeof body.categoryId === "string" && OBJECT_ID_RE.test(body.categoryId)) {
    out.add(body.categoryId);
  }
  if (out.size === 0) return null;
  return Array.from(out);
}

/**
 * Parse a stored `categoryPriorities` JSON value into a typed map.
 * Returns an empty record for null/invalid input so callers can safely lookup.
 */
export function parseCategoryPriorities(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!OBJECT_ID_RE.test(k)) continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/** Pull a single category's priority out of a campaign's `categoryPriorities`. */
export function getCategoryPriority(
  raw: unknown,
  categoryId: string,
): number | null {
  const map = parseCategoryPriorities(raw);
  return Object.prototype.hasOwnProperty.call(map, categoryId)
    ? map[categoryId]
    : null;
}

/**
 * Read the legacy single `categoryId` (still present on documents that
 * pre-date the m2m migration) plus the new `categoryIds[]`. Used by display
 * code that needs to render a category badge for older campaigns whose
 * `categoryIds` array hasn't been backfilled yet.
 */
export function resolveCampaignCategoryIds(c: {
  categoryIds?: string[] | null;
  categoryId?: string | null;
}): string[] {
  const ids = new Set<string>();
  if (Array.isArray(c.categoryIds)) {
    for (const id of c.categoryIds) if (id) ids.add(id);
  }
  if (typeof c.categoryId === "string" && c.categoryId) ids.add(c.categoryId);
  return Array.from(ids);
}

/**
 * Build a Prisma `where` clause matching campaigns that belong to a given
 * category. Uses the m2m array via `has`. Exposed for routes that filter
 * donations/subscriptions by a campaign's category.
 */
export function campaignInCategoryWhere(
  categoryId: string,
): Prisma.CampaignWhereInput {
  return { categoryIds: { has: categoryId } };
}
