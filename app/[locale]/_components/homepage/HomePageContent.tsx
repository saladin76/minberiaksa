"use client";

import React, { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import axios from "axios";
import { Globe, MoreHorizontal, Baby, Home, Map, ArrowRight, ShieldCheck, Eye, BadgeCheck, Camera } from "lucide-react";
import CategoryIcon, { parseCategoryIcon } from "@/components/CategoryIcon";

import HeroSlider, { type SlideItem } from "./HeroSlider";
import CampaignsSlider from "./CampaignsSlider";
import QuickDonate from "./QuickDonate";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import type { CampaignCardData } from "../CampaignCard";

// LiveDonationsTicker is a non-critical floating widget — keep it client-only
// and below-the-fold so it doesn't pull its chunk into the LCP critical path.
const LiveDonationsTicker = dynamic(() => import("@/components/LiveDonationsTicker"), {
  loading: () => null,
  ssr: false,
});

interface CategoryItem {
  id: string;
  slug?: string | null;
  name: string;
  image?: string | null;
  icon?: string | null;
  order?: number;
}

interface PostItem {
  id: string;
  slug?: string | null;
  title: string;
  description: string | null;
  image: string | null;
  published: boolean;
  createdAt: string;
}

interface HomePageContentProps {
  firstHeroImage?: string | null;
  initialSlides?: SlideItem[];
  initialCampaigns: CampaignCardData[];
  initialNextCursor: string | null;
  initialHasMore: boolean;
  initialCategories: CategoryItem[];
  initialPosts: PostItem[];
}

const STATS = [
  { icon: Home, valueKey: "stat1Value", labelKey: "stat1Label", value: "100K+" },
  { icon: Baby, valueKey: "stat2Value", labelKey: "stat2Label", value: "500K+" },
  { icon: Globe, valueKey: "stat3Value", labelKey: "stat3Label", value: "20" },
  { icon: Map, valueKey: "stat4Value", labelKey: "stat4Label", value: "4" },
];

/**
 * Legibility wash for the category tiles. Weighted to the bottom on purpose: the
 * name needs a solid base, but the photo is the point of the card, so the top ~40%
 * is left almost untouched. A plain `to-t` Tailwind gradient puts its midpoint at
 * 50% and drowns the whole image, which is why this is spelled out in stops.
 */
const CATEGORY_TILE_WASH =
  "linear-gradient(to top, rgba(2,29,50,0.95) 0%, rgba(2,29,50,0.78) 26%, rgba(2,29,50,0.28) 55%, rgba(2,29,50,0) 100%)";

const TRUST_FEATURES = [
  { icon: ShieldCheck, titleKey: "trust1Title", titleFallback: "Güvenli ödeme", descKey: "trust1Desc", descFallback: "Kart ve banka destekli bağış altyapısı." },
  { icon: Eye, titleKey: "trust2Title", titleFallback: "Şeffaf süreç", descKey: "trust2Desc", descFallback: "Bağış süreci ve bilgilendirme akışı." },
  { icon: BadgeCheck, titleKey: "trust3Title", titleFallback: "Kamu yararına", descKey: "trust3Desc", descFallback: "Resmi kayıtlı kamu yararına dernek vurgusu." },
  { icon: Camera, titleKey: "trust4Title", titleFallback: "Saha çalışmaları", descKey: "trust4Desc", descFallback: "Saha fotoğrafları ve raporlarla görünür etki." },
];

const HomePage: React.FC<HomePageContentProps> = ({
  firstHeroImage,
  initialSlides = [],
  initialCampaigns,
  initialNextCursor,
  initialHasMore,
  initialCategories,
  initialPosts,
}) => {
  const t = useTranslations("HomePage");
  const tBlog = useTranslations("BlogCard");
  // Category tiles reuse the existing "Donate Now" label rather than adding a
  // near-duplicate key to all eight locale files.
  const tCampaign = useTranslations("Campaign");
  const locale = useLocale();

  // Mirror SSR-provided data into local state. If SSR's internal fetches failed
  // (e.g. base-URL resolution mismatch, internal API timeout), we'll populate them
  // from the browser as a fallback so the homepage is never blank.
  const [categories, setCategories] = useState<CategoryItem[]>(initialCategories);
  const [posts, setPosts] = useState<PostItem[]>(initialPosts);

  useEffect(() => {
    if (categories.length > 0) return;
    let cancelled = false;
    fetch(`/api/categories?locale=${locale}&limit=12&sortBy=order`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => {
        if (cancelled) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setCategories(items as CategoryItem[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  useEffect(() => {
    if (posts.length > 0) return;
    let cancelled = false;
    axios
      .get("/api/posts", { params: { locale, limit: 3 } })
      .then((r) => {
        if (cancelled) return;
        const items = Array.isArray(r.data?.items) ? r.data.items : [];
        setPosts(items as PostItem[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  return (
    <div className="bg-white">
      {/* ── Hero Slider ── */}
      <HeroSlider
        initialSlides={initialSlides}
        initialFirstImage={firstHeroImage ?? null}
        initialCategories={categories}
      />

      {/* ── Featured Campaigns Slider — fully SSR'd from server-fetched data, so the
              cards render in the initial HTML and there's nothing to shift in. */}
      <section className="bg-offwhite pt-14 sm:pt-20 pb-6 sm:pb-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between mb-8">
            <div>
              <div className="gold-mark mb-4" />
              <h2 className="text-3xl sm:text-4xl font-extrabold text-deep">{t("currentProjects") || "Güncel Projeler"}</h2>
              <p className="mt-3 text-gray-500">{t("featuredProjects") || "ÖNE ÇIKAN PROJELER"}</p>
            </div>
            <Link href="/campaigns" className="shape-button inline-flex items-center gap-2 bg-deep hover:bg-navy px-5 py-3 text-sm font-semibold text-white transition-colors w-fit">
              {t("viewAll") || "Tümünü Gör"} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </Link>
          </div>
          {/* Suspense boundary required because CampaignCard descendants call useSearchParams. */}
          <Suspense fallback={null}>
            <CampaignsSlider
              initialCampaigns={initialCampaigns}
              initialNextCursor={initialNextCursor}
              initialHasMore={initialHasMore}
            />
          </Suspense>
        </div>
      </section>

      {/* ── Quick Donate — also SSR'd with the categories the server already fetched. */}
      <section
        className="relative lg:py-10 sm:py-14 overflow-hidden bg-gray-50"
        style={{
          backgroundImage: "url('/bg.webp')",
          backgroundRepeat: "repeat",
          backgroundSize: "320px",
          backgroundBlendMode: "multiply",
        }}
      >
        <div className="relative z-10 max-w-7xl mx-auto">
          <Suspense fallback={null}>
            <QuickDonate initialCategories={categories} />
          </Suspense>
        </div>
      </section>

      {/* ── Statistics Banner ── */}
      <section className="hero-pattern relative overflow-hidden py-16 sm:py-24">
        {/* dotted texture + soft gold glow */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.06] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]" />
        <div className="pointer-events-none absolute -left-24 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-burgundy/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-gold/15 blur-3xl" />

        <div className="relative z-10 mx-auto max-w-7xl px-4">
          <div className="mb-10 flex flex-col items-center text-center sm:mb-14">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-gold">{t("weHelp")}</span>
            <h2 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl lg:text-5xl">{t("communityImpact")}</h2>
            <div className="gold-mark mt-5" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {STATS.map((stat, i) => (
              <div
                key={i}
                className="group relative overflow-hidden rounded-[24px_8px_24px_8px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-gold/40 hover:bg-white/[0.07] sm:p-7"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 text-gold ring-1 ring-gold/30 transition-transform duration-300 group-hover:scale-105">
                  <stat.icon className="h-6 w-6" />
                </div>
                <div className="text-4xl font-extrabold leading-none text-white sm:text-5xl">{stat.value}</div>
                <div className="mt-2.5 text-xs font-medium text-ice sm:text-sm">{t(stat.labelKey as Parameters<typeof t>[0])}</div>
                <div className="pointer-events-none absolute -end-8 -top-8 h-20 w-20 rounded-full bg-gold/10 blur-2xl transition-transform duration-500 group-hover:scale-150" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Donation Categories — full-bleed image mosaic ── */}
      {categories.length > 0 && (() => {
        const shown = categories.slice(0, 6);
        // The lg mosaic is a 3×3 grid where the first tile takes a 2×2 block and the
        // other five fill the remaining cells exactly — so it only tiles cleanly with a
        // full set of six. It also needs a picture worth blowing up: categories without
        // an image fall back to a pattern, which shouldn't be the biggest thing on the
        // section. Either condition failing drops back to an even grid.
        const isMosaic = shown.length === 6 && Boolean(shown[0].image);
        return (
          <section
            className="bg-offwhite py-10 sm:py-14 border-y border-black/5"
            style={{
              backgroundImage: "url('/bg.webp')",
              backgroundRepeat: "repeat",
              backgroundSize: "200px",
              backgroundBlendMode: "multiply",
            }}
          >
            <div className="max-w-7xl mx-auto px-4">
              <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-burgundy">{t("weHelp")}</span>
                  <h2 className="mt-1.5 text-2xl font-extrabold text-deep sm:text-3xl">{t("donationCategories")}</h2>
                  <div className="gold-mark-sm mt-3" />
                </div>
                <Link
                  href="/campaigns"
                  className="hidden shrink-0 sm:inline-flex items-center gap-1.5 shape-button bg-deep hover:bg-navy px-4 py-2 text-[13px] font-semibold text-white transition-colors"
                >
                  {t("viewAll")} <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </Link>
              </div>

              <div className="grid grid-cols-2 auto-rows-[142px] gap-2.5 sm:auto-rows-[168px] sm:grid-cols-3 sm:gap-3 lg:auto-rows-[180px]">
                {shown.map((cat, i) => {
                  const featured = isMosaic && i === 0;
                  // A flag is a filled rectangle, so blown up as a faint watermark it
                  // reads as a stray colour block rather than as decoration. Stroke
                  // glyphs — Lucide's and our own — are fine.
                  const watermark =
                    !cat.image && parseCategoryIcon(cat.icon).kind !== "flag";
                  return (
                    <Link
                      key={cat.id}
                      href={`/category/${cat.slug || cat.id}`}
                      className={`group relative isolate flex flex-col overflow-hidden shape-card bg-gradient-to-br from-navy via-deep to-soft shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift ${
                        featured ? "lg:col-span-2 lg:row-span-2" : ""
                      }`}
                    >
                      {cat.image ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={cat.image}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                        />
                      ) : (
                        /* Several categories genuinely have no image. Rather than a flat
                           block of colour, those get the brand texture over the gradient. */
                        <div
                          className="absolute inset-0 -z-10 opacity-[0.35]"
                          style={{
                            backgroundImage: "url('/bg.webp')",
                            backgroundRepeat: "repeat",
                            backgroundSize: "180px",
                          }}
                        />
                      )}

                      {/* Legibility wash — photos vary wildly in exposure, so the name sits
                          on a guaranteed dark base rather than on the image itself. */}
                      <div className="absolute inset-0" style={{ backgroundImage: CATEGORY_TILE_WASH }} />

                      {/* …and an oversized watermark of the category's own icon, so an
                          image-less tile still reads as designed instead of as a gap. */}
                      {watermark && (
                        <div
                          className="pointer-events-none absolute -bottom-4 -end-3 text-white/[0.09] transition-transform duration-700 ease-out group-hover:scale-110"
                          aria-hidden
                        >
                          <CategoryIcon name={cat.icon} className="h-24 w-24" />
                        </div>
                      )}

                      <div className="pointer-events-none absolute inset-0 shape-card ring-1 ring-inset ring-white/10 transition-colors duration-300 group-hover:ring-gold/50" />

                      {/* Badge only for a category that actually chose an icon. Most have
                          none, and CategoryIcon falls back to a heart — six identical
                          hearts across the grid is noise, not identity. */}
                      {cat.icon?.trim() && (
                        <div
                          className={`absolute top-3 start-3 flex items-center justify-center shape-chip bg-white/10 text-gold ring-1 ring-white/20 backdrop-blur-sm transition-all duration-300 group-hover:bg-gold group-hover:text-deep group-hover:ring-gold ${
                            featured ? "h-8 w-8 lg:h-11 lg:w-11" : "h-8 w-8"
                          }`}
                        >
                          <CategoryIcon
                            name={cat.icon}
                            className={featured ? "h-4 w-4 lg:h-[22px] lg:w-[22px]" : "h-4 w-4"}
                          />
                        </div>
                      )}

                      <div className="relative mt-auto w-full p-3 sm:p-3.5 lg:p-4">
                        {/* Built from utilities rather than the .gold-mark-sm class so the
                            hover width actually wins the cascade against its fixed width. */}
                        <div
                          className={`mb-2 h-1 rounded-full bg-gold transition-all duration-500 group-hover:w-12 ${
                            featured ? "w-10" : "w-8"
                          }`}
                        />
                        <h3
                          className={`font-extrabold leading-snug text-white drop-shadow-sm line-clamp-2 ${
                            featured ? "text-base sm:text-lg lg:text-2xl" : "text-[15px] sm:text-base"
                          }`}
                        >
                          {cat.name}
                        </h3>
                        <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-white/85 transition-colors duration-300 group-hover:text-gold sm:text-xs">
                          {tCampaign("donateNow")}
                          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>

              <div className="sm:hidden text-center mt-5">
                <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-burgundy">
                  {t("viewAll")} <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </Link>
              </div>
            </div>
          </section>
        );
      })()}

      {/* ── News / Blog — editorial featured + list ── */}
      {posts.length > 0 && (() => {
        const featured = posts[0];
        const rest = posts.slice(1);
        const NEWS_FALLBACK_IMG = "https://i.ibb.co/N2zVsqfg/calisma-alanlarimiz-egitim-sektoru.jpg";
        return (
          <section className="bg-offwhite py-16 sm:py-24">
            <div className="max-w-7xl mx-auto px-4">
              <div className="mb-10 flex flex-col gap-5 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.25em] text-burgundy">{t("latestNews")}</span>
                  <h2 className="mt-3 text-3xl font-extrabold text-deep sm:text-4xl">{t("news")}</h2>
                  <p className="mt-3 max-w-md text-gray-500">{t("newsSubtitle")}</p>
                  <div className="gold-mark mt-5" />
                </div>
                <Link href="/blog" className="hidden shrink-0 sm:inline-flex items-center gap-2 shape-button bg-deep hover:bg-navy px-5 py-3 text-sm font-semibold text-white transition-colors">
                  {t("viewAll")} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </Link>
              </div>

              <div className={`grid gap-6 ${rest.length ? "lg:grid-cols-2" : ""}`}>
                {/* Featured */}
                <Link
                  href={`/blog/${featured.slug || featured.id}`}
                  className={`group relative flex flex-col overflow-hidden shape-card bg-white shadow-soft transition-all duration-300 hover:shadow-lift ${rest.length ? "" : "mx-auto w-full max-w-3xl"}`}
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={featured.image || NEWS_FALLBACK_IMG}
                      alt={featured.title}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="image-overlay absolute inset-x-0 bottom-0 h-2/3" />
                    <span className="shape-chip absolute top-5 start-5 inline-flex items-center bg-burgundy px-3 py-1.5 text-[11px] font-bold text-white shadow-soft">
                      {t("news")}
                    </span>
                    <div className="absolute inset-x-0 bottom-0 p-6">
                      <div className="gold-mark-sm mb-3" />
                      <h3 className="line-clamp-2 text-xl font-extrabold leading-snug text-white drop-shadow-sm sm:text-2xl">
                        {featured.title}
                      </h3>
                    </div>
                  </div>
                  {featured.description && (
                    <div className="flex flex-col p-6">
                      <p className="line-clamp-2 text-sm leading-relaxed text-gray-500">{featured.description}</p>
                      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-burgundy transition-colors group-hover:text-burgundyDark">
                        {tBlog("readMore")} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                      </span>
                    </div>
                  )}
                </Link>

                {/* Side list */}
                {rest.length > 0 && (
                  <div className="flex flex-col gap-4">
                    {rest.map((post) => (
                      <Link
                        key={post.id}
                        href={`/blog/${post.slug || post.id}`}
                        className="group flex items-center gap-4 overflow-hidden shape-card bg-white p-3 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift sm:p-4"
                      >
                        <div className="relative h-24 w-28 shrink-0 overflow-hidden shape-chip sm:h-28 sm:w-32">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={post.image || NEWS_FALLBACK_IMG}
                            alt={post.title}
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-burgundy">{t("news")}</span>
                          <h4 className="mt-1 line-clamp-2 font-bold leading-snug text-deep transition-colors group-hover:text-burgundy">{post.title}</h4>
                          <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-400 transition-colors group-hover:text-burgundy">
                            {tBlog("readMore")} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-8 text-center sm:hidden">
                <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm font-semibold text-burgundy">
                  {t("viewAll")} <MoreHorizontal className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </section>
        );
      })()}

      {/* ── Trust strip — reassurance cards ── */}
      <section className="bg-white pb-16 pt-6 sm:pb-24 sm:pt-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
            {TRUST_FEATURES.map((f) => (
              <div
                key={f.titleKey}
                className="group relative overflow-hidden shape-card border border-gray-100 bg-white p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
              >
                <div className="relative z-10 mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-burgundy to-burgundyDark text-white shadow-soft transition-transform duration-300 group-hover:scale-105">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="relative z-10 text-lg font-bold text-deep">{t(f.titleKey as Parameters<typeof t>[0]) || f.titleFallback}</h3>
                <p className="relative z-10 mt-2 text-sm leading-relaxed text-gray-500">{t(f.descKey as Parameters<typeof t>[0]) || f.descFallback}</p>
                <div className="pointer-events-none absolute -bottom-10 -end-10 h-24 w-24 rounded-full bg-gold/10 transition-transform duration-500 group-hover:scale-150" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <LiveDonationsTicker />
    </div>
  );
};

export default HomePage;
