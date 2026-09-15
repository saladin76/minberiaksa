"use client";

import Link from "next/link";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import type { SiteBanner as SiteBannerData } from "@/lib/minbar/banners";

/**
 * One dashboard banner, in the dress of the "Journey to Al-Aqsa" band
 * (`TravelBanner.tsx`): a coloured frame, a one-line kicker strip on ivory, a
 * desaturated photograph under a navy gradient, price chips pinned to one
 * corner, the heading and the buttons anchored to the opposite bottom corner.
 *
 * Everything that varies is data: the tone sets the frame, the kicker colour
 * and the primary button; `textSide` mirrors the copy and the chips; chips
 * are USD figures converted for display, labelled in the visitor's language.
 * With no photograph the frame shows the site pattern over the tone instead.
 *
 * Styles live in minbar.css under `.mia-bn-*`.
 */
export default function SiteBanner({ banner }: { banner: SiteBannerData }) {
  const { format } = useMinbarMoney();
  const arrow = (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mia-arrow-next">
      <path d="M14 6l-6 6 6 6" />
    </svg>
  );

  return (
    <section className="mia-bn-sec" data-banner={banner.slug}>
      <div className="mia-bn-wrap" data-tone={banner.tone} data-side={banner.textSide}>
        {banner.kicker ? (
          <div className="mia-bn-kicker">
            <span aria-hidden="true" className="mia-bn-diamond" />
            <p>{banner.kicker}</p>
            <span aria-hidden="true" className="mia-bn-diamond" />
          </div>
        ) : null}

        <div className="mia-bn-body" data-photo={banner.image ? "true" : "false"} data-chips={banner.chips.length ? "true" : "false"}>
          {banner.image ? (
            <span role="img" aria-label={banner.title} className="mia-bn-photo" style={{ backgroundImage: `url('${banner.image}')` }} />
          ) : (
            <span aria-hidden="true" data-aqsa-pattern="" className="mia-bn-pattern" />
          )}
          <span aria-hidden="true" className="mia-bn-shade" />

          {banner.chips.length ? (
            <div className="mia-bn-chips">
              {banner.chips.map((chip, i) => (
                <span key={`${chip.usd}-${i}`} className="mia-bn-chip" data-accent={i === banner.chips.length - 1 && banner.chips.length > 1 ? "true" : "false"}>
                  <b dir="ltr" style={{ unicodeBidi: "isolate" }}>{format(chip.usd)}</b>
                  {chip.label ? <span>{chip.label}</span> : null}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mia-bn-content">
            <h2 className="mia-bn-title">{banner.title}</h2>
            {banner.description ? <p className="mia-bn-text">{banner.description}</p> : null}
            {banner.cta || banner.ctaSecondary ? (
              <div className="mia-bn-ctas">
                {banner.cta ? (
                  <Link href={banner.cta.href} className="mia-bn-cta mia-bn-cta--primary">
                    {banner.cta.label || banner.title}
                    {arrow}
                  </Link>
                ) : null}
                {banner.ctaSecondary ? (
                  <Link href={banner.ctaSecondary.href} className="mia-bn-cta mia-bn-cta--light">
                    {banner.ctaSecondary.label}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
