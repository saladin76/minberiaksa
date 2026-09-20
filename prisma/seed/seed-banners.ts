/**
 * prisma/seed/seed-banners.ts — the two shared bands as dashboard banners.
 *
 * "Journey to Al-Aqsa" (`TravelBanner.tsx`) and "'Ibādan Lanā"
 * (`IbadanBanner.tsx`) used to be mounted as static components. This writes
 * them into `UrgentBanner` so an editor can move, retire or reword them, with
 * the copy the components drew from the message catalogue — every one of the
 * 19 locales, taken from `i18n/messages/*.json` rather than retyped here, so
 * the seeded banner reads exactly as the static one did in each language.
 *
 * What the model cannot carry, and so is deliberately dropped:
 *   · the 'Ibādan wordmark tile in the photograph's corner — the corner is
 *     the price-chip slot, and the banner has no chips;
 *   · the verse's translation as a second line under the Arabic — the kicker
 *     is one line, so Arabic sessions get the verse and every other locale
 *     gets the translation of its meaning with the surah reference.
 *
 * The travel banner is tied to its campaign by id, so its buttons land on the
 * project page in the visitor's own language; the 'Ibādan one links to the
 * programme's super-category page by URL, as the component did.
 *
 * Idempotent: upsert on the slug, translations upserted per locale.
 * Placement, priority and schedule are left alone on re-runs unless `--force`
 * is passed, so a drag on the dashboard survives a reseed.
 *
 *   npx tsx prisma/seed/seed-banners.ts [--force] [--dry]
 */
import { PrismaClient } from "@prisma/client";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { messagesFor } from "../../i18n/locale-messages";
import { verseBlock } from "../../lib/minbar/quran";
import { IMG } from "../../lib/minbar/content/media";
import { placementKey } from "../../lib/minbar/banner-placements";

const prisma = new PrismaClient();

const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry");

/** The pages the static bands sat on before they were pulled from the code. */
const PLACEMENTS = [placementKey("aqsa", "bottom")];

/** The campaign the travel banner sells, in `seed-data.json` terms. */
const TRAVEL_CAMPAIGN_SLUG = "al-quds-friday-transport";
/** The 'Ibādan programme page — `SLUGS.ibadanProject` in `lib/minbar/routes.ts`. */
const IBADAN_URL = "/projects/ibadan-lana";

type Copy = { title: string; description: string; kicker: string; ctaLabel: string; ctaSecondaryLabel: string; amountLabels: string[] };

/** One dotted message key, in one locale; empty when the catalogue lacks it. */
function msg(locale: string, path: string): string {
  const value = path.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), messagesFor(locale));
  return typeof value === "string" ? value : "";
}

function travelCopy(locale: string): Copy {
  return {
    title: msg(locale, "homepage.fridayHeading1"),
    description: msg(locale, "homepage.fridaySubtitle"),
    kicker: msg(locale, "homepage.fridayQuote"),
    ctaLabel: msg(locale, "homepage.donateBus"),
    ctaSecondaryLabel: msg(locale, "homepage.donateSeat"),
    amountLabels: [`${msg(locale, "homepage.seat")} ${msg(locale, "homepage.one")}`, `${msg(locale, "homepage.bus")} ${msg(locale, "homepage.full")}`],
  };
}

function ibadanCopy(locale: string): Copy {
  const quran = messagesFor(locale).quran as Parameters<typeof verseBlock>[0];
  const verse = verseBlock(quran, "isra_5", locale);
  return {
    title: msg(locale, "homepage.ibadanHeading1"),
    description: msg(locale, "homepage.ibadanSubtitle"),
    kicker: verse.translation ? `${verse.translation} — ${verse.label}` : verse.arabic,
    ctaLabel: msg(locale, "common.donate"),
    ctaSecondaryLabel: msg(locale, "homepage.learnProject"),
    amountLabels: [],
  };
}

interface BannerSeed {
  slug: string;
  image: string;
  copy: (locale: string) => Copy;
  campaignId?: string;
  ctaUrl?: string;
  suggestedAmounts: number[];
  priority: number;
}

async function upsertBanner(seed: BannerSeed) {
  const ar = seed.copy("ar");
  const scalars = {
    title: ar.title,
    description: ar.description,
    kicker: ar.kicker,
    image: seed.image,
    ctaLabel: ar.ctaLabel,
    ctaUrl: seed.ctaUrl ?? null,
    ctaSecondaryLabel: ar.ctaSecondaryLabel,
    ctaSecondaryUrl: null,
    campaignId: seed.campaignId ?? null,
    suggestedAmounts: seed.suggestedAmounts,
    amountLabels: ar.amountLabels,
    tone: "red",
    textSide: "start",
  };
  /* Editorial state an editor may have changed since the last run. */
  const editorial = { placements: PLACEMENTS, priority: seed.priority, locales: [] as string[], startsAt: null, endsAt: null, isActive: true };

  if (DRY) {
    console.log(`[dry] ${seed.slug}`, { ...scalars, ...editorial });
    for (const locale of SUPPORTED_LOCALES) console.log(`  ${locale}:`, seed.copy(locale));
    return;
  }

  const row = await prisma.urgentBanner.upsert({
    where: { slug: seed.slug },
    update: FORCE ? { ...scalars, ...editorial } : scalars,
    create: { slug: seed.slug, ...scalars, ...editorial },
    select: { id: true },
  });

  for (const locale of SUPPORTED_LOCALES) {
    const copy = seed.copy(locale);
    if (!copy.title) continue;
    await prisma.urgentBannerTranslation.upsert({
      where: { urgentBannerId_locale: { urgentBannerId: row.id, locale } },
      update: copy,
      create: { urgentBannerId: row.id, locale, ...copy },
    });
  }
  console.log(`✓ ${seed.slug} (${SUPPORTED_LOCALES.length} locales)`);
}

async function main() {
  const travelCampaign = await prisma.campaign.findUnique({ where: { slug: TRAVEL_CAMPAIGN_SLUG }, select: { id: true } });
  if (!travelCampaign) console.warn(`campaign "${TRAVEL_CAMPAIGN_SLUG}" not found — the travel banner will have no link until it is seeded`);

  await upsertBanner({
    slug: "journey-to-al-aqsa",
    image: IMG.minber,
    copy: travelCopy,
    campaignId: travelCampaign?.id,
    suggestedAmounts: [15, 750],
    priority: 0,
  });

  await upsertBanner({
    slug: "ibadan-lana",
    image: "/minbar/assets/ibadan-hero.jpg",
    copy: ibadanCopy,
    ctaUrl: IBADAN_URL,
    suggestedAmounts: [],
    priority: 1,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
