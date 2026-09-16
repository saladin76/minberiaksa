import type { ReactNode } from "react";
import CategoryIcon from "@/components/CategoryIcon";

/**
 * The icon on one of a category page's explanatory cards.
 *
 * The first cards were drawn with eight glyphs of their own (`alert`, `home`,
 * …), which is what the earliest categories still store. Since then a card may
 * carry any value a category's own icon may — a Lucide name, one of the
 * organisation's drawn glyphs (`custom:Mosque`) or a flag (`flag:PS`) — picked
 * with the same picker. Both kinds render here, so the public page and the
 * dashboard preview cannot drift.
 */

/** The original eight, kept so existing cards keep their drawing. */
export const LEGACY_CARD_ICONS: Record<string, ReactNode> = {
  alert: (
    <>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 2.5 18a1.6 1.6 0 0 0 1.4 2.4h16.2a1.6 1.6 0 0 0 1.4-2.4L13.7 3.9a1.6 1.6 0 0 0-2.8 0Z" />
    </>
  ),
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  heart: <path d="M12 21s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 7.5 3c0 5.3-7.5 10-7.5 10Z" />,
  hands: (
    <>
      <path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M10 10V4.5a1.5 1.5 0 0 1 3 0V10" />
      <path d="M13 10.5V6a1.5 1.5 0 0 1 3 0v7" />
      <path d="M16 12v-1a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-1a7 7 0 0 1-7-7v-2a1.5 1.5 0 0 1 3 0" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v6c0 4.2 2.9 7.8 7 9 4.1-1.2 7-4.8 7-9V6Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  water: <path d="M12 3s6 6.4 6 10.2A6 6 0 0 1 6 13.2C6 9.4 12 3 12 3Z" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.9M17 14.4a5.5 5.5 0 0 1 3.5 5.1" />
    </>
  ),
};

export function isLegacyCardIcon(name: string): boolean {
  return Boolean(LEGACY_CARD_ICONS[name]);
}

/**
 * Renders a card's icon at the size `className` gives it. Legacy glyphs share
 * Lucide's 24×24 stroke geometry, so the same class sizes either kind alike.
 */
export function CategoryCardIcon({ name, className }: { name: string; className: string }) {
  const legacy = LEGACY_CARD_ICONS[name];
  if (legacy) {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {legacy}
      </svg>
    );
  }
  return <CategoryIcon name={name} className={className} />;
}
