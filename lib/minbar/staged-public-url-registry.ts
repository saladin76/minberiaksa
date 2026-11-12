/**
 * Staged route registry for the multilingual public-URL migration.
 *
 * Nothing in this module changes the live router, sitemap, metadata or payments.
 * Candidate translations are NOT enabled until native review, URL inventory,
 * content-ID mappings and tested legacy aliases are available.
 */
import { SUPPORTED_LOCALES, type SupportedLocale } from "../locales";
import { NOINDEX_ROUTES, SLUGS, type MinbarRoute } from "./routes";

/** Only public, non-transactional routes may be migrated with this registry. */
export type MigratableRoute = Extract<MinbarRoute,
  "projects" | "projectDetail" | "blog" | "article" | "about" | "contact" | "recurring"
>;
export type ContentFamily = "project" | "article" | "category";

export interface RouteProposal {
  locale: SupportedLocale;
  route: MigratableRoute;
  slug: string;
  status: "candidate" | "approved";
}

/**
 * Editorial examples, not published routes. Do not promote without approval:
 * /en/donate may mean a donate action rather than the projects catalogue.
 */
export const INITIAL_ROUTE_PROPOSALS: readonly RouteProposal[] = [
  { locale: "ar", route: "projects", slug: "المشاريع", status: "candidate" },
  { locale: "tr", route: "projects", slug: "bagislar", status: "candidate" },
  { locale: "en", route: "projects", slug: "donate", status: "candidate" },
  { locale: "fr", route: "projects", slug: "faire-un-don", status: "candidate" },
  { locale: "ar", route: "blog", slug: "المدونة", status: "candidate" },
  { locale: "tr", route: "blog", slug: "blog", status: "candidate" },
  { locale: "en", route: "blog", slug: "blog", status: "candidate" },
  { locale: "fr", route: "blog", slug: "blog", status: "candidate" },
  { locale: "ar", route: "about", slug: "من-نحن", status: "candidate" },
  { locale: "tr", route: "about", slug: "hakkimizda", status: "candidate" },
  { locale: "en", route: "about", slug: "about-us", status: "candidate" },
  { locale: "fr", route: "about", slug: "qui-sommes-nous", status: "candidate" },
  { locale: "ar", route: "contact", slug: "اتصل-بنا", status: "candidate" },
  { locale: "tr", route: "contact", slug: "iletisim", status: "candidate" },
  { locale: "en", route: "contact", slug: "contact-us", status: "candidate" },
  { locale: "fr", route: "contact", slug: "contact", status: "candidate" },
  { locale: "ar", route: "recurring", slug: "التبرع-الدوري", status: "candidate" },
  { locale: "tr", route: "recurring", slug: "duzenli-bagis", status: "candidate" },
  { locale: "en", route: "recurring", slug: "recurring-donation", status: "candidate" },
  { locale: "fr", route: "recurring", slug: "don-regulier", status: "candidate" },
] as const;

/** Existing checkout, donor and payment paths must never be claimed by public SEO routes. */
const RESERVED_PREFIXES = new Set<string>([
  "api", "dashboard", "auth", "campaign", "campaigns", "category",
  "donates", "bank-transfer", "donation-failed", "donation-success",
  ...[...NOINDEX_ROUTES].map(route => SLUGS[route].split("/")[0]).filter(Boolean),
]);

const FAMILY_ROUTE: Readonly<Record<ContentFamily, MigratableRoute>> = {
  project: "projects",
  article: "blog",
  category: "projects", // Reserved only: categories must receive their own approved route before activation.
};

export interface LocalizedContentSlug {
  type: ContentFamily;
  entityId: string;
  locale: SupportedLocale;
  slug: string;
  published: boolean;
  indexable: boolean;
}

export interface HistoricAlias {
  /** Full historical path, including its locale, without query string. */
  path: string;
  type: ContentFamily;
  entityId: string;
  locale: SupportedLocale;
}

export function normalizePublicPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("?") || path.includes("#") ||
      /%(?:2f|5c|00)/i.test(path) || /[\\\u0000-\u001f\u007f]/.test(path)) {
    throw new Error("INVALID_PUBLIC_PATH");
  }
  let decoded: string;
  try { decoded = decodeURI(path); } catch { throw new Error("INVALID_PUBLIC_ENCODING"); }
  if (decoded.includes("//") || decoded.split("/").some(segment => segment === "." || segment === "..")) {
    throw new Error("UNSAFE_PUBLIC_PATH");
  }
  // Reject double-encoded path separators and traversal before any reverse-proxy decoding.
  if (/%(?:2f|5c|00|2e)/i.test(decoded)) throw new Error("AMBIGUOUS_PUBLIC_ENCODING");
  return decoded.normalize("NFC").replace(/\/+$/, "") || "/";
}

function validSegment(slug: string): boolean {
  return !!slug && slug !== "." && slug !== ".." &&
    !/[\\/?#%\u0000-\u001f\u007f]/.test(slug) && !slug.includes("/");
}

function normalizeSlug(slug: string): string {
  let value: string;
  try { value = decodeURIComponent(slug); } catch { throw new Error("INVALID_CONTENT_SLUG"); }
  value = value.normalize("NFC");
  if (!validSegment(value)) throw new Error("INVALID_CONTENT_SLUG");
  return value;
}

function localePrefix(path: string): string | null {
  const locale = path.split("/")[1];
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale) ? locale : null;
}

/**
 * Constructor is fail-closed. No partial locale fallback: if a translation or
 * route is unavailable, the caller must handle that explicitly.
 */
export class StagedPublicUrlRegistry {
  private readonly routes = new Map<string, string>();
  private readonly content = new Map<string, LocalizedContentSlug>();
  private readonly aliases = new Map<string, HistoricAlias>();
  private readonly pathOwners = new Map<string, string>();

  constructor(
    proposals: readonly RouteProposal[],
    rows: readonly LocalizedContentSlug[] = [],
    aliases: readonly HistoricAlias[] = [],
  ) {
    for (const proposal of proposals) {
      if (!SUPPORTED_LOCALES.includes(proposal.locale) || !validSegment(proposal.slug)) {
        throw new Error("INVALID_LOCALIZED_ROUTE");
      }
      if (proposal.status !== "approved") continue;
      if (RESERVED_PREFIXES.has(proposal.slug)) throw new Error("RESERVED_PUBLIC_ROUTE");
      const route = proposal.route === "projectDetail" ? "projects" :
        proposal.route === "article" ? "blog" : proposal.route;
      const key = `${proposal.locale}:${route}`;
      const previous = this.routes.get(key);
      if (previous && previous !== proposal.slug) throw new Error("CONFLICTING_ROUTE_TRANSLATION");
      const path = normalizePublicPath(`/${proposal.locale}/${proposal.slug}`);
      this.claim(path, `route:${key}`);
      this.routes.set(key, proposal.slug);
    }
    for (const row of rows) {
      if (!SUPPORTED_LOCALES.includes(row.locale) || !row.entityId.trim()) throw new Error("INVALID_ENTITY");
      const slug = normalizeSlug(row.slug);
      const key = `${row.type}:${row.entityId}:${row.locale}`;
      if (this.content.has(key)) throw new Error("DUPLICATE_CONTENT_TRANSLATION");
      this.content.set(key, { ...row, slug });
      // Only published/indexable records can claim a canonical public URL.
      if (row.published && row.indexable && row.type !== "category") {
        const prefix = this.routes.get(`${row.locale}:${FAMILY_ROUTE[row.type]}`);
        if (prefix) this.claim(normalizePublicPath(`/${row.locale}/${prefix}/${slug}`), `entity:${key}`);
      }
    }
    for (const alias of aliases) {
      const path = normalizePublicPath(alias.path);
      if (localePrefix(path) !== alias.locale) throw new Error("ALIAS_LOCALE_MISMATCH");
      if (RESERVED_PREFIXES.has(path.split("/")[2] ?? ""))
        throw new Error("PROTECTED_HISTORIC_ALIAS");
      if (!alias.entityId.trim()) throw new Error("INVALID_ALIAS_ENTITY");
      const owner = `entity:${alias.type}:${alias.entityId}:${alias.locale}`;
      if (this.pathOwners.has(path) && this.pathOwners.get(path) !== owner) {
        throw new Error("ALIAS_COLLIDES_WITH_CANONICAL");
      }
      const prior = this.aliases.get(path);
      if (prior && (prior.entityId !== alias.entityId || prior.type !== alias.type || prior.locale !== alias.locale)) {
        throw new Error("ALIAS_OWNERSHIP_CONFLICT");
      }
      this.aliases.set(path, alias);
    }
  }

  private claim(path: string, owner: string): void {
    const previous = this.pathOwners.get(path);
    if (previous && previous !== owner) throw new Error("PUBLIC_ROUTE_COLLISION");
    this.pathOwners.set(path, owner);
  }

  routePath(route: MigratableRoute, locale: SupportedLocale): string | null {
    const key = route === "projectDetail" ? "projects" : route === "article" ? "blog" : route;
    const slug = this.routes.get(`${locale}:${key}`);
    return slug ? `/${locale}/${encodeURIComponent(slug)}` : null;
  }

  contentPath(type: ContentFamily, entityId: string, locale: SupportedLocale): string | null {
    if (type === "category") return null; // Require approved category architecture first.
    const row = this.content.get(`${type}:${entityId}:${locale}`);
    if (!row?.published || !row.indexable) return null;
    const prefix = this.routePath(FAMILY_ROUTE[type], locale);
    return prefix ? `${prefix}/${encodeURIComponent(row.slug)}` : null;
  }

  /** Resolves to the same immutable entity; never guesses from another locale's slug. */
  switchContentLocale(type: ContentFamily, entityId: string, target: SupportedLocale): string | null {
    return this.contentPath(type, entityId, target);
  }

  /** Does not preserve query here: redirect layer must preserve safe raw query separately. */
  /** Preflight report: aliases with no published canonical destination block migration. */
  auditAliasTargets(): { checked: number; unresolved: string[]; selfReferential: string[] } {
    const unresolved: string[] = [];
    const selfReferential: string[] = [];
    for (const [path, alias] of this.aliases) {
      const target = this.contentPath(alias.type, alias.entityId, alias.locale);
      if (!target) unresolved.push(path);
      else if (normalizePublicPath(target) === path) selfReferential.push(path);
    }
    return { checked: this.aliases.size, unresolved: unresolved.sort(), selfReferential: selfReferential.sort() };
  }

  resolveAlias(path: string): string | null {
    const alias = this.aliases.get(normalizePublicPath(path));
    if (!alias) return null;
    const destination = this.contentPath(alias.type, alias.entityId, alias.locale);
    return destination && normalizePublicPath(destination) !== normalizePublicPath(path) ? destination : null;
  }
}

/** Not enabled: an explicit empty approved registry until code + data pass release gates. */
export const stagedPublicUrlRegistry = new StagedPublicUrlRegistry(INITIAL_ROUTE_PROPOSALS);
