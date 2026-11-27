/**
 * The gift page settings (dashboard → صفحة الإهداء). Kept in the RecurringPageSettings collection
 * under the key "gift", beside Ramadan's, with the same revision guard. Amounts and package prices
 * are USD. A package is a fixed-value gift on one project (e.g. "water for a family" at 50 USD);
 * its name and note are the project's own, in the visitor's language.
 */
export const GIFT_PACKAGE_ICONS = ["water", "meal", "basket", "book", "waqf", "gift", "heart"] as const;
export type GiftPackageIcon = (typeof GIFT_PACKAGE_ICONS)[number];
export type GiftPackage = { projectId: string; price: number; icon: GiftPackageIcon };

export type GiftSettings = {
  enabled: boolean;
  amounts: number[]; // USD presets for "I choose the amount"
  projectIds: string[]; // projects the free amount can go to, ordered
  packages: GiftPackage[]; // ready gifts, ordered
};

export const DEFAULT_GIFT_SETTINGS: GiftSettings = {
  enabled: false,
  amounts: [25, 50, 100, 250, 500, 1000],
  projectIds: [],
  packages: [],
};
