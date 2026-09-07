/**
 * Filter clause that matches campaigns the dashboard hasn't soft-deleted.
 *
 * In Prisma+MongoDB, none of the shorter syntaxes reliably include legacy rows
 * where `isDeleted` was never written:
 *  - `{ isDeleted: false }`         — misses null + unset
 *  - `{ isDeleted: null }`          — misses unset (Prisma quirk: `null` ≠ "missing")
 *  - `{ NOT: { isDeleted: true } }` — silently drops unset rows in production
 *  - `{ isDeleted: { not: true } }` — same problem; the connector seems to add
 *    an `$exists: true` guard
 *
 * The only form proven to match `false ∪ null ∪ unset` in this app is the
 * comprehensive OR with `isSet: false` (the explicit MongoDB "field absent"
 * check). Use this constant everywhere campaigns are listed publicly or on
 * the dashboard.
 *
 * Mirror for Category.isActive: see `categoryActiveFilter` below.
 */
export const NOT_SOFT_DELETED = {
  OR: [
    { isDeleted: false },
    { isDeleted: null },
    { isDeleted: { isSet: false } },
  ],
};

/**
 * Filter clause that matches categories considered active (or never written —
 * legacy rows). Use everywhere categories are listed without the
 * `includeInactive`/`isActiveFalse` opt-in.
 */
export const CATEGORY_ACTIVE_OR_UNSET = {
  OR: [
    { isActive: true },
    { isActive: null },
    { isActive: { isSet: false } },
  ],
};
