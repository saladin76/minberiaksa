/**
 * The gift page settings (dashboard → صفحة الإهداء). Kept in the RecurringPageSettings collection
 * under the key "gift", with the same revision guard as Ramadan's. Amounts are USD.
 *
 * The page is a catalog, not a list of projects: waqf gifts (share / metre, at the waqf page's own
 * prices, with the waqf certificate in the recipient's name), "impact" gifts the team names and
 * describes (each spent on one project), and an open gift at the donor's own value. Every value the
 * donor is offered comes from here; nothing is priced in the page itself.
 */
import type { GIFT_OCCASIONS } from "@/lib/donations/gift-order";

export const GIFT_PACKAGE_ICONS = ["water", "meal", "basket", "book", "waqf", "gift", "heart", "orphan"] as const;
export type GiftPackageIcon = (typeof GIFT_PACKAGE_ICONS)[number];
export type GiftIntention = (typeof GIFT_OCCASIONS)[number];
export type GiftText = { ar: string; en: string; tr: string };

export type ImpactGift = {
  id: string; // stable key, a-z0-9-
  projectId: string;
  icon: GiftPackageIcon;
  name: GiftText;
  note: GiftText;
  intentions: GiftIntention[]; // suggested first for these intentions
};

export type GiftSettings = {
  enabled: boolean;
  amounts: number[]; // suggested values, USD
  waqf: { share: boolean; meter: boolean; intentions: GiftIntention[] };
  impactGifts: ImpactGift[];
  openProjectId: string | null; // where "a donation at your value" goes; null hides it
};

export const DEFAULT_GIFT_SETTINGS: GiftSettings = {
  enabled: false,
  amounts: [],
  waqf: { share: true, meter: true, intentions: ["memory"] },
  impactGifts: [],
  openProjectId: null,
};
