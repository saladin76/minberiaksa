import { prisma } from "@/lib/prisma";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { miaPath } from "@/lib/minbar/routes";
import { placementKey, type BannerSlotKey, type BannerTextSide, type BannerTone } from "@/lib/minbar/banner-placements";

/**
 * The banners the site renders — read for one locale and one slot, resolved
 * to plain strings so the client component only draws.
 *
 * Resolution done here, once, rather than in every mount:
 *   · copy falls back locale → English → Arabic (`pickTranslation`);
 *   · a banner tied to a campaign links to that campaign's page IN THIS
 *     LOCALE (every language has its own project slug), and a typed relative
 *     URL gets the locale prefix so `/projects/x` from the dashboard lands on
 *     `/fr/projects/x` for a French visitor;
 *   · `all:<slot>` banners join the page's own, in drag order.
 */

export interface SiteBanner {
  id: string;
  slug: string;
  title: string;
  kicker: string;
  description: string;
  image: string;
  tone: BannerTone;
  textSide: BannerTextSide;
  cta: { label: string; href: string } | null;
  ctaSecondary: { label: string; href: string } | null;
  /** USD chips with their labels, same length. */
  chips: Array<{ usd: number; label: string }>;
}

const SELECT = (locale: string) =>
  ({
    id: true,
    slug: true,
    title: true,
    description: true,
    kicker: true,
    image: true,
    ctaLabel: true,
    ctaUrl: true,
    ctaSecondaryLabel: true,
    ctaSecondaryUrl: true,
    campaignId: true,
    suggestedAmounts: true,
    amountLabels: true,
    tone: true,
    textSide: true,
    priority: true,
    translations: {
      where: translationLocaleWhere(locale),
      take: 2,
      select: { locale: true, title: true, description: true, ctaLabel: true, kicker: true, ctaSecondaryLabel: true, amountLabels: true },
    },
  }) as const;

/** A relative URL gets this locale's prefix; absolute and anchored ones pass through. */
export function localizeHref(url: string, locale: string): string {
  const u = url.trim();
  if (!u) return "";
  if (/^(https?:)?\/\//i.test(u) || u.startsWith("#") || u.startsWith("mailto:") || u.startsWith("tel:")) return u;
  const path = u.startsWith("/") ? u : `/${u}`;
  if (new RegExp(`^/${locale}(/|$)`).test(path)) return path;
  return `/${locale}${path}`;
}

export async function listBanners(locale: string, page: string, slot: BannerSlotKey): Promise<SiteBanner[]> {
  const keys = [placementKey(page, slot), placementKey("all", slot)];
  const now = Date.now();
  let rows;
  try {
    /* The schedule window is applied in code, not in the query: Prisma on
       MongoDB returns nothing when `OR [startsAt null | lte]` is combined
       with an array `hasSome` on the same row. Banners are a handful, so the
       cost is nil; `urgentBannerLiveWhere` stays the contract elsewhere. */
    const all = await prisma.urgentBanner.findMany({
      where: {
        isActive: true,
        placements: { hasSome: keys },
        OR: [{ locales: { isEmpty: true } }, { locales: { has: locale } }],
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      select: { ...SELECT(locale), startsAt: true, endsAt: true },
    });
    rows = all.filter(
      (b) => (!b.startsAt || b.startsAt.getTime() <= now) && (!b.endsAt || b.endsAt.getTime() >= now)
    );
  } catch (e) {
    console.error("listBanners:", e);
    return [];
  }
  if (!rows.length) return [];

  /* The campaign link, per locale. One query for every referenced campaign. */
  const campaignIds = [...new Set(rows.map((r) => r.campaignId).filter((v): v is string => !!v))];
  const campaigns = campaignIds.length
    ? await prisma.campaign.findMany({
        where: { id: { in: campaignIds }, isActive: true },
        select: { id: true, slug: true, translations: { where: translationLocaleWhere(locale), select: { locale: true, slug: true } } },
      })
    : [];
  const hrefByCampaign = new Map(
    campaigns.map((c) => [c.id, miaPath("projectDetail", locale, pickTranslation(c.translations, locale)?.slug || c.slug || c.id)])
  );

  return rows.map((b) => {
    const t = pickTranslation(b.translations, locale);
    const campaignHref = b.campaignId ? hrefByCampaign.get(b.campaignId) : undefined;
    const primaryHref = b.ctaUrl ? localizeHref(b.ctaUrl, locale) : campaignHref ?? "";
    const secondaryHref = b.ctaSecondaryUrl ? localizeHref(b.ctaSecondaryUrl, locale) : primaryHref;
    const labels = t?.amountLabels?.length ? t.amountLabels : b.amountLabels;
    return {
      id: b.id,
      slug: b.slug,
      title: t?.title || b.title,
      kicker: t?.kicker || b.kicker || "",
      description: t?.description || b.description || "",
      image: b.image ?? "",
      tone: b.tone as BannerTone,
      textSide: b.textSide as BannerTextSide,
      cta: primaryHref ? { label: t?.ctaLabel || b.ctaLabel || "", href: primaryHref } : null,
      ctaSecondary:
        (t?.ctaSecondaryLabel || b.ctaSecondaryLabel) && secondaryHref
          ? { label: t?.ctaSecondaryLabel || b.ctaSecondaryLabel || "", href: secondaryHref }
          : null,
      chips: b.suggestedAmounts.map((usd, i) => ({ usd, label: labels[i] ?? "" })),
    };
  });
}
