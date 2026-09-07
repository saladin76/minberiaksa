import type { ReactElement } from "react";

/**
 * Filter-chip icons for the projects catalogue.
 *
 * Ported from `Minbar/المشاريع.dc.html` → `Component.CAT_ICON_PATHS`. Every
 * category has its own drawn SVG rather than a default glyph, which is the
 * handoff's rule for icons throughout the site.
 */
export type CategoryIconName =
  | "layout-grid"
  | "landmark"
  | "hand-heart"
  | "moon-star"
  | "siren"
  | "hand-coins"
  | "scroll-text"
  | "book-open-check"
  | "graduation-cap"
  | "home"
  | "calendar-heart"
  | "beef"
  | "globe";

const PATHS: Record<CategoryIconName, ReactElement> = {
  "layout-grid": (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.4" />
      <rect x="14" y="3" width="7" height="7" rx="1.4" />
      <rect x="14" y="14" width="7" height="7" rx="1.4" />
      <rect x="3" y="14" width="7" height="7" rx="1.4" />
    </>
  ),
  landmark: (
    <>
      <path d="M3 21h18" />
      <path d="M6 21V10M10 21V10M14 21V10M18 21V10" />
      <path d="M12 3 20 8H4Z" />
    </>
  ),
  "hand-heart": <path d="M12 20s-6.2-3.8-6.2-8.4A3.6 3.6 0 0 1 12 9.2a3.6 3.6 0 0 1 6.2 2.4C18.2 16.2 12 20 12 20Z" />,
  "moon-star": (
    <>
      <path d="M20 13.2A8 8 0 1 1 10.8 4a6.4 6.4 0 0 0 9.2 9.2Z" />
      <path d="M18 3.5v3M16.6 5h2.8" />
    </>
  ),
  siren: (
    <>
      <path d="M12 4a5 5 0 0 0-5 5v6.5h10V9a5 5 0 0 0-5-5Z" />
      <path d="M4 19h16M12 1.5v2" />
    </>
  ),
  "hand-coins": (
    <>
      <circle cx="9" cy="9" r="4" />
      <path d="M15 8.5h2.5a2 2 0 0 1 0 4H15" />
      <path d="M4 20c1.6-2.6 4.2-4 7-4" />
    </>
  ),
  "scroll-text": (
    <>
      <path d="M7 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2c1 0 2-.8 2-2v-15Z" />
      <path d="M7 3.5h10a2 2 0 0 1 2 2v3H8.5" />
      <path d="M9.5 11.5H19M9.5 15.5H19" />
    </>
  ),
  "book-open-check": (
    <>
      <path d="M2 5.2c3-1.1 6-1.1 9 .8v13c-3-1.9-6-1.9-9-.8Z" />
      <path d="M22 5.2c-3-1.1-6-1.1-9 .8v13c3-1.9 6-1.9 9-.8Z" />
    </>
  ),
  "graduation-cap": (
    <>
      <path d="M22 9.5 12 4.5 2 9.5l10 5 10-5Z" />
      <path d="M6 12v4.5c3 2 9 2 12 0V12" />
    </>
  ),
  home: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.7V20h13V9.7" />
    </>
  ),
  "calendar-heart": (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M12 18s-3.2-1.9-3.2-4.2a2.1 2.1 0 0 1 3.2-1.7 2.1 2.1 0 0 1 3.2 1.7C15.2 16.1 12 18 12 18Z" />
    </>
  ),
  beef: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12h8M12 8v8" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a13.5 13.5 0 0 1 0 18a13.5 13.5 0 0 1 0-18Z" />
    </>
  ),
};

export default function CategoryIcon({ name }: { name: CategoryIconName }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] ?? PATHS["layout-grid"]}
    </svg>
  );
}
