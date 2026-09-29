import { VARIABLE_CATALOG } from "./variables";

/**
 * A fake `TemplateContext` built from the variable catalog's own example values.
 *
 * Template editors need to show what a message will look like once merged, but must never reach
 * for a real donor to do it. Deriving the sample from `VARIABLE_CATALOG` means a newly added
 * variable gets a sensible preview value for free  and, more importantly, that every editor
 * previews against the *same* values, so two channels can be compared side by side.
 *
 * Extracted from the WhatsApp editor when SMS needed the same thing; it is preview-only data and
 * is never persisted or sent.
 */
export const SAMPLE_TEMPLATE_CONTEXT = (() => {
  const flat: Record<string, string> = {};
  for (const group of VARIABLE_CATALOG) {
    for (const entry of group.entries) {
      flat[entry.token.replace(/[{}]/g, "").trim()] = entry.exampleValue;
    }
  }
  const get = (key: string) => flat[key] ?? "";

  return {
    user: {
      id: "sample",
      name: get("user.name"),
      email: get("user.email"),
      phone: get("user.phone"),
      countryName: get("user.countryName"),
      countryCode: get("user.countryCode"),
      city: get("user.city"),
      region: "",
      preferredLang: get("user.preferredLang"),
    },
    donations: [
      {
        id: "sample-1",
        amount: get("amount"),
        amountUSD: get("amountUSD"),
        currency: get("currency"),
        totalAmount: get("amount"),
        status: "PAID",
        createdAt: get("createdAt"),
        campaignTitle: get("campaignTitle"),
        itemCount: "1",
        items: [
          {
            campaignTitle: get("campaignTitle"),
            amount: get("amount"),
            amountUSD: get("amountUSD"),
            currency: get("currency"),
            shareCount: "",
          },
        ],
      },
    ],
    update: {
      title: get("update.title"),
      description: get("update.description"),
      image: get("update.image"),
      videoUrl: get("update.videoUrl"),
      videoThumbnail: get("update.videoThumbnail"),
      cover: get("update.cover"),
      date: get("update.date"),
      campaignTitle: get("update.campaignTitle"),
      url: get("update.url"),
      donateUrl: get("update.donateUrl"),
    },
    totals: {
      count: get("totals.count"),
      amountUSD: get("totals.amountUSD"),
      lastAt: get("totals.lastAt"),
    },
    donation: {
      id: "sample-1",
      amount: get("amount"),
      amountUSD: get("amountUSD"),
      currency: get("currency"),
      totalAmount: get("amount"),
      status: "PAID",
      createdAt: get("createdAt"),
      campaignTitle: get("campaignTitle"),
      itemCount: "2",
      items: [
        {
          campaignTitle: get("campaignTitle"),
          amount: "25",
          amountUSD: "25",
          currency: get("currency"),
          shareCount: "",
        },
        {
          campaignTitle: "حملة الشتاء",
          amount: "25",
          amountUSD: "25",
          currency: get("currency"),
          shareCount: "",
        },
      ],
    },
  };
})();
