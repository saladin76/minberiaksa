"use client";
import React, { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import HeroQuickDonate from "./HeroQuickDonate";

interface HeroCategory {
  id: string;
  name: string;
  image?: string | null;
}

export interface SlideItem {
  id: string;
  title: string;
  description: string;
  image: string | null;
  showButton: boolean;
  buttonText: string;
  buttonLink: string;
  order: number;
}

interface HeroSliderProps {
  /**
   * Slides fetched server-side. When provided, the component renders the first slide
   * synchronously into the SSR HTML — that <img> is the LCP element, so eliminating
   * the previous on-mount /api/slides re-fetch removes a 1–2 s window where Lighthouse
   * was measuring LCP at the *swapped* image, not the SSR-painted one.
   */
  initialSlides?: SlideItem[];
  /** Fallback image (typically a Cloudinary URL) when initialSlides is empty. */
  initialFirstImage?: string | null;
  /** Server-fetched categories for the functional quick-donate card in the hero. */
  initialCategories?: HeroCategory[];
}

function buildHeroSrc(src: string, width: number): string {
  if (!src.includes("res.cloudinary.com")) return src;
  return src.replace(
    /\/upload\//,
    `/upload/f_auto,q_auto:eco,w_${width},c_limit/`
  );
}

function buildHeroSrcSet(src: string): string {
  return [640, 1024, 1536]
    .map((w) => `${buildHeroSrc(src, w)} ${w}w`)
    .join(", ");
}

const HeroSlider: React.FC<HeroSliderProps> = ({ initialSlides = [], initialFirstImage, initialCategories = [] }) => {
  const t = useTranslations("HeroSlider");
  const locale = useLocale() as "ar" | "en" | "fr";
  const [slides, setSlides] = useState<SlideItem[]>(initialSlides);
  const [current, setCurrent] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  // Only re-fetch from /api/slides if the server didn't provide them (or if the
  // locale changed after hydration via the language switcher). When SSR didn't
  // populate slides — fetch immediately so the user never sees a blank hero.
  useEffect(() => {
    if (initialSlides.length > 0) return;
    let cancelled = false;
    fetch(`/api/slides?locale=${locale}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const items = data?.items ?? [];
        setSlides(Array.isArray(items) ? items : []);
        setCurrent(0);
      })
      .catch(() => {
        if (!cancelled) setSlides([]);
      });
    return () => {
      cancelled = true;
    };
  }, [locale, initialSlides.length]);

  // Build the list of images shown in the right-hand showcase card. When no
  // slides were fetched we still want a single image (or, failing that, the
  // pattern) so the hero never looks empty.
  const imageSlides: Array<{
    id: string;
    image: string;
    title: string;
    description: string;
    showButton: boolean;
    buttonText: string;
    buttonLink: string;
  }> =
    slides
      .filter((s): s is SlideItem & { image: string } => Boolean(s.image))
      .map((s) => ({
        id: s.id,
        image: s.image,
        title: s.title ?? "",
        description: s.description ?? "",
        showButton: Boolean(s.showButton),
        buttonText: s.buttonText ?? "",
        buttonLink: s.buttonLink ?? "",
      }));
  if (imageSlides.length === 0 && initialFirstImage) {
    imageSlides.push({
      id: "fallback",
      image: initialFirstImage,
      title: "",
      description: "",
      showButton: false,
      buttonText: "",
      buttonLink: "",
    });
  }
  const hasMultiple = imageSlides.length > 1;

  const nextSlide = useCallback(() => {
    setCurrent((prev) => (imageSlides.length ? (prev + 1) % imageSlides.length : 0));
  }, [imageSlides.length]);

  const prevSlide = useCallback(() => {
    setCurrent((prev) => (imageSlides.length ? (prev - 1 + imageSlides.length) % imageSlides.length : 0));
  }, [imageSlides.length]);

  // Auto-rotation. Hold the first slide for an extra-long time so the LCP image
  // stays stable through the measurement window.
  useEffect(() => {
    if (!isPlaying || imageSlides.length <= 1) return;
    const slideInterval = setInterval(() => {
      nextSlide();
    }, 6000);
    return () => clearInterval(slideInterval);
  }, [isPlaying, nextSlide, imageSlides.length]);

  return (
    <section className="hero-pattern relative overflow-x-clip text-white">
      {/* ── Faded slider images as a full-bleed texture behind the deep brand
            color. Same `current` index as the showcase card, so the background
            and the card share one image — the picture appears to "bleed" out of
            the card and wash across the whole hero. ── */}
      <div className="absolute inset-0 z-0 opacity-20" aria-hidden="true">
        {imageSlides.map((slide, index) => (
          <div
            key={`bg-${slide.id}`}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              current === index ? "opacity-100" : "opacity-0"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={buildHeroSrc(slide.image, 1536)}
              srcSet={buildHeroSrcSet(slide.image)}
              sizes="100vw"
              alt=""
              decoding="async"
              loading="lazy"
              className="h-full w-full object-cover object-center"
            />
          </div>
        ))}
      </div>
      {/* Deep wash: keeps the brand color dominant and the left-side copy legible. */}
      <div className="absolute inset-0 z-0 bg-gradient-to-r from-deep via-deep/70 to-deep/30" />

      <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-8 px-5 py-12 sm:py-14 lg:grid-cols-[1fr_.85fr] lg:gap-10 lg:px-8 lg:py-20">
        {/* ── Left: brand message, CTAs, trust stats ── */}
        <div className="text-center lg:text-start">
          <span className="shape-chip inline-block bg-burgundy px-4 py-1.5 text-xs font-bold tracking-wide text-white shadow-soft">
            {t("badge")}
          </span>

          <h1 className="mx-auto my-6 max-w-3xl text-3xl font-extrabold leading-tight sm:text-4xl lg:mx-0 lg:text-5xl xl:text-6xl">
            {t("title")}
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-ice sm:text-base lg:mx-0">
            {t("subtitle")}
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3 lg:justify-start">
            <Link
              href="/campaigns"
              className="shape-button bg-burgundy px-5 py-3 text-sm font-semibold text-white shadow-soft transition-all duration-300 hover:scale-105 hover:bg-burgundyDark"
            >
              {t("donateNow")}
            </Link>
            <Link
              href="/contact-us"
              className="shape-button bg-white px-5 py-3 text-sm font-semibold text-deep transition-all duration-300 hover:scale-105 hover:bg-ice"
            >
              {t("contactUs")}
            </Link>
          </div>

          <div className="mx-auto mt-8 grid max-w-xl grid-cols-3 gap-3 text-xs sm:text-sm lg:mx-0">
            {[
              { title: t("stat1Title"), text: t("stat1Text") },
              { title: t("stat2Title"), text: t("stat2Text") },
              { title: t("stat3Title"), text: t("stat3Text") },
            ].map((stat, i) => (
              <div key={i} className="border-t-2 border-gold/40 pt-2.5 lg:border-t-0 lg:pt-0">
                <b className="block text-sm font-bold lg:text-base">{stat.title}</b>
                <span className="text-ice">{stat.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: rotating image showcase + floating quick-donate card ── */}
        <div className="relative">
          <div
            className="shape-card-alt relative h-[280px] overflow-hidden bg-navy shadow-lift sm:h-[320px] lg:h-[380px]"
            onMouseEnter={() => setIsPlaying(false)}
            onMouseLeave={() => setIsPlaying(true)}
          >
            {imageSlides.length > 0 ? (
              imageSlides.map((slide, index) => (
                <div
                  key={slide.id}
                  className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                    current === index ? "opacity-100 z-10" : "opacity-0 z-0"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={buildHeroSrc(slide.image, 1024)}
                    srcSet={buildHeroSrcSet(slide.image)}
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    alt={slide.title || ""}
                    decoding="async"
                    loading={index === 0 ? "eager" : "lazy"}
                    fetchPriority={index === 0 ? "high" : "auto"}
                    className="h-full w-full object-cover object-center"
                  />

                  {/* Readability scrim + slide title/description/button */}
                  {(slide.title || slide.description || (slide.showButton && slide.buttonText && slide.buttonLink)) && (
                    <>
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-deep/90 via-deep/40 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 z-10 p-4 text-start sm:p-5">
                        {slide.title && (
                          <h3 className="text-lg font-extrabold leading-snug text-white drop-shadow-sm sm:text-xl lg:text-2xl line-clamp-2">
                            {slide.title}
                          </h3>
                        )}
                        {slide.description && (
                          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-ice/90 sm:text-sm line-clamp-2">
                            {slide.description}
                          </p>
                        )}
                        {slide.showButton && slide.buttonText && slide.buttonLink && (
                          (() => {
                            const btnClass =
                              "group/btn mt-3 inline-flex items-center gap-1.5 shape-button bg-gold px-4 py-2 text-xs font-bold text-deep shadow-soft transition-all duration-300 hover:scale-105 hover:bg-gold/90 sm:text-sm";
                            const isExternal = /^https?:\/\//i.test(slide.buttonLink);
                            const Arrow = (
                              <ChevronRight
                                className={`h-4 w-4 transition-transform group-hover/btn:translate-x-0.5 ${
                                  locale === "ar" ? "rotate-180 group-hover/btn:-translate-x-0.5" : ""
                                }`}
                              />
                            );
                            return isExternal ? (
                              <a href={slide.buttonLink} target="_blank" rel="noopener noreferrer" className={btnClass}>
                                {slide.buttonText}
                                {Arrow}
                              </a>
                            ) : (
                              <Link href={slide.buttonLink} className={btnClass}>
                                {slide.buttonText}
                                {Arrow}
                              </Link>
                            );
                          })()
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))
            ) : (
              <div className="absolute inset-0 hero-pattern" />
            )}

            {/* Soft inner ring for a crafted, premium edge */}
            <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] ring-1 ring-inset ring-white/10" />

            {hasMultiple && (
              <>
                <button
                  onClick={prevSlide}
                  className="absolute left-3 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-white/20 p-2 text-white backdrop-blur-sm transition-all hover:scale-110 hover:bg-white/40 sm:flex"
                  aria-label="Previous slide"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={nextSlide}
                  className="absolute right-3 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-white/20 p-2 text-white backdrop-blur-sm transition-all hover:scale-110 hover:bg-white/40 sm:flex"
                  aria-label="Next slide"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>

                <div className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 gap-2">
                  {imageSlides.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrent(index)}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        current === index ? "w-7 bg-gold" : "w-2 bg-white/60 hover:bg-white/90"
                      }`}
                      aria-label={`Go to slide ${index + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Quick-donate card — functional (real donation flow). Sits just below the
              showcase, overlapping its bottom edge on every breakpoint so the slide's
              title/description above it stay visible and nothing gets clipped. */}
          {/* <div className="relative z-30 -mt-12 mx-3 sm:mx-6 lg:mx-4">
            <HeroQuickDonate initialCategories={initialCategories} />
          </div> */}
        </div>
      </div>
    </section>
  );
};

export default HeroSlider;
