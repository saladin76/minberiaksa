import React from "react";

/**
 * Category glyphs that Lucide doesn't ship.
 *
 * lucide-react is pinned at 0.474 across this project (~170 files import it, and
 * later releases rename and remove icons), so a missing icon is redrawn here
 * rather than fixed by bumping the package. Everything below therefore uses
 * Lucide's own canvas and default attributes — 24×24, `viewBox="0 0 24 24"`,
 * no fill, `currentColor` stroke at width 2, round caps and joins — so these sit
 * beside real Lucide icons without looking like a different set.
 *
 * The subjects are the ones an Islamic relief organisation needs and a general
 * icon library has no reason to carry: a mosque, an udhiyah animal, a water
 * well, a Ramadan lantern, orphan sponsorship, and so on.
 */

export type CategoryGlyph = React.FC<React.SVGProps<SVGSVGElement>>;

/** Wraps path data in Lucide's standard SVG shell. */
function glyph(name: string, children: React.ReactNode): CategoryGlyph {
  const Component: CategoryGlyph = ({ className, ...props }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
  Component.displayName = name;
  return Component;
}

/** مسجد — dome, two minarets, arched door. */
export const Mosque = glyph(
  "Mosque",
  <>
    <path d="M2 21h20" />
    <path d="M5 21v-9" />
    <path d="M19 21v-9" />
    <path d="M7 21v-8" />
    <path d="M17 21v-8" />
    <path d="M7.5 13a4.5 4.5 0 0 1 9 0" />
    <path d="M12 8.5V7" />
    <path d="M10 21v-3.5a2 2 0 0 1 4 0V21" />
  </>,
);

/** مصحف — a closed book with a crescent on the cover. */
export const Quran = glyph(
  "Quran",
  <>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <path d="M11.4 6.6a2 2 0 0 0 3 3 3 3 0 1 1-3-3Z" />
  </>,
);

/** سجادة صلاة — prayer rug with a mihrab arch and fringe. */
export const PrayerRug = glyph(
  "PrayerRug",
  <>
    <path d="M6 20V8a6 6 0 0 1 12 0v12z" />
    <path d="M9.5 20v-5.5a2.5 2.5 0 0 1 5 0V20" />
    <path d="M4 20h16" />
    <path d="M6 22h12" />
  </>,
);

/** هلال — crescent and star, for Ramadan and Eid appeals. */
export const Crescent = glyph(
  "Crescent",
  <>
    <path d="M9.2 4a5.1 5.1 0 0 0 7.65 7.65 7.65 7.65 0 1 1-7.65-7.65Z" />
    <path d="M19 2.6l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8z" />
  </>,
);

/** فانوس رمضان — Ramadan lantern. */
export const Lantern = glyph(
  "Lantern",
  <>
    <path d="M9 4a3 3 0 0 1 6 0" />
    <path d="M7 4h10" />
    <path d="M8.5 4 7 8v8l1.5 4h7l1.5-4V8l-1.5-4" />
    <path d="M7 8h10" />
    <path d="M7 16h10" />
    <path d="M8 20h8" />
    <path d="M12 10v4" />
  </>,
);

/** أضحية — sheep, for udhiyah and aqiqah campaigns. */
export const Sheep = glyph(
  "Sheep",
  <>
    <path d="M4 13a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4v1a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" />
    <circle cx="19" cy="11" r="2.2" />
    <path d="m20.6 9.3 1.4-1.2" />
    <path d="M7 18v3" />
    <path d="M10.5 18v3" />
    <path d="M14 18v3" />
  </>,
);

/**
 * بئر ماء — stone well with a winch beam, rope and bucket.
 * Drawn as a cylinder rather than a pitched-roof hut: with a gable on top it
 * read as a plain house at 18px, which is the size the category chips use.
 */
export const WaterWell = glyph(
  "WaterWell",
  <>
    <path d="M7 11V6" />
    <path d="M17 11V6" />
    <path d="M5.5 6h13" />
    <path d="M12 6v2.5" />
    <path d="M10.3 8.5h3.4v2.2h-3.4z" />
    <ellipse cx="12" cy="13" rx="7" ry="2.2" />
    <path d="M5 13v5c0 1.2 3.1 2.2 7 2.2s7-1 7-2.2v-5" />
  </>,
);

/** نخلة — date palm, for agricultural and sadaqah jariyah projects. */
export const DatePalm = glyph(
  "DatePalm",
  <>
    <path d="M12 21v-9" />
    <path d="M9 21h6" />
    <path d="M12 12V8" />
    <path d="M12 12c0-3-2-5-5-5" />
    <path d="M12 12c0-3 2-5 5-5" />
    <path d="M12 12c-2-2-5-2-7 0" />
    <path d="M12 12c2-2 5-2 7 0" />
  </>,
);

/** تمر — bowl of dates, for iftar and Ramadan food appeals. */
export const Dates = glyph(
  "Dates",
  <>
    <path d="M2.5 13h19a9.5 9.5 0 0 1-19 0Z" />
    <ellipse cx="8" cy="10" rx="2" ry="3" transform="rotate(-20 8 10)" />
    <ellipse cx="12" cy="9" rx="2" ry="3" />
    <ellipse cx="16" cy="10" rx="2" ry="3" transform="rotate(20 16 10)" />
  </>,
);

/** بطانية — folded blanket, for winter kits. */
export const Blanket = glyph(
  "Blanket",
  <>
    <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3H3z" />
    <path d="M3 11h18v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M7.5 11v9" />
    <path d="M12 11v9" />
    <path d="M16.5 11v9" />
  </>,
);

/** كفالة يتيم — an adult and a child, hand in hand. */
export const OrphanCare = glyph(
  "OrphanCare",
  <>
    <circle cx="7.5" cy="5" r="2.5" />
    <path d="M3.5 21v-6a4 4 0 0 1 8 0v6" />
    <circle cx="17" cy="10" r="2" />
    <path d="M14 21v-4a3 3 0 0 1 6 0v4" />
    <path d="M11.5 15H14" />
  </>,
);

/** كرسي متحرك — wheelchair, for disability support projects. */
export const Wheelchair = glyph(
  "Wheelchair",
  <>
    <circle cx="8" cy="4" r="2" />
    <path d="M8 8v4h5" />
    <path d="m13 12 2.5 5H18" />
    <circle cx="11" cy="16.5" r="4.5" />
  </>,
);

/**
 * Registry of the locally drawn glyphs. Keys are stored verbatim in
 * `Category.icon`, optionally behind a `custom:` prefix.
 */
export const CUSTOM_CATEGORY_ICONS: Record<string, CategoryGlyph> = {
  Mosque,
  Quran,
  PrayerRug,
  Crescent,
  Lantern,
  Sheep,
  WaterWell,
  DatePalm,
  Dates,
  Blanket,
  OrphanCare,
  Wheelchair,
};

export const CUSTOM_CATEGORY_ICON_NAMES = Object.keys(CUSTOM_CATEGORY_ICONS);
