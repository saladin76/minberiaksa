/**
 * Field imagery, ported from `Minbar/media.js`.
 *
 * The photographs live in the foundation's Google Drive folder ("منبر الأقصى")
 * and are served through Drive's thumbnail endpoint, so nothing here is a local
 * asset. `SOURCE_OF_TRUTH.md` lists this as design-time media that a Media API
 * replaces later; until then it stays the single source so a photo swap is one
 * edit rather than a sweep across pages.
 *
 * `forSlug` deliberately returns `null` when a project has no photograph of its
 * own. The handoff is explicit about not filling the gap with an image from a
 * different region — a Gaza photograph on an Al-Quds project misrepresents the
 * work.
 */

/** A Drive file id as a servable thumbnail URL at the requested width. */
export const drive = (id: string, width = 1600) =>
  `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;

export const GAZA_MEALS = [
  "16D72JzXMHbp72ZJCHHFWLjUYrmUX4ta1",
  "1KwE0HHp0b3rlI2f92G-6qi1lPCCcEpNA",
  "1H1bYRvLbz1uaD2bY2HRo1DYmZyEB-sap",
  "1kF9HTHXgpsrMP8etvRNu3qyjxJn0fvD4",
];
export const GAZA_WATER = [
  "1xR1EQc1t04e9MU0KdEOK-sYx5qPKNw-h",
  "1DjzK7PN9n2oaIpccZvrFoxVZAH_dItnc",
  "16oQIqJSfqv71XLR1qWKp6ZdLxha5ipJO",
];
export const GAZA_PARCELS = [
  "1cuaNUr0YAgACFmRPN4PqRe7NqQa8Dn1n",
  "1JAN85hJ4T4quE_IrECGj3t1jSF6OTV_J",
  "1SNlW8G76z50lNQ9yLzI48GwTmnLpGANw",
  "1G4xyOnwtCOnWMbKZkxNpCrFOK7cvAbj_",
];
export const GAZA_BREAD = [
  "1G9eiM5DHIBUlcGpd-QM16dx91ZOepGFj",
  "1QLYqewqnQhAHp9Xbjsy_Ce1JyRwXAQ-S",
  "1Wa1VbOv_L9u3fpRpragu-Mf5SoAjARne",
  "1rzSCc25EeGYCb60FiFNVIIp3Vn3tKE1G",
];
export const QUDS_IFTAR = [
  "1w3n8DABq9o4P_tCr-yFe9NCvMfGHEO5D",
  "1BVqS-NToZUkESGcFEnXb1tPhs6qvQOHQ",
  "1V5oakKydOepP1upVzMJ_K9sWBsgSQ1dL",
  "1GKlH6yVXzxEmni6SolP1u2G5PgmXtyQ0",
  "1Eccv_NetanBoiTt28emB9silncIXEwJW",
  "13RMhP_EfiYRaTFhknFhAo1w_uIl8L0ss",
];
export const QUDS_CITY = [
  "1lv4Mmx0GPxyytDHGhHW6RgGdmR8NIE4z",
  "1HxtEvt3utPDAKBsFiKsL955btDa_rBoY",
  "124y49jpGx2KAzqIBOMtk-FKMFq-jxPCc",
  "1UECRg613f7W0O2mtk4SMhx3rQvCl6EeT",
  "1uIKpo36Mg8XPqmfQH1zb6QqMpRlFsTO6",
  "1Q3pR1xZHNyRicG2pmWhpljqGWb1ISE_T",
  "1gUY5F6hCczZU7nwJQZNr8D3WKwtVqmER",
  "1648TEaeeRM0RewAHpNUGqmSbg_XvRWu4",
];
export const TRAVEL = [
  "1M8ko8LbhKpuDRYIlyNTewegv-gTuCnkI",
  "1AyPsdUYNg1XwfZog16Cw8PHBETFMJHSm",
  "12Y-C-ERyL640NNAjU9opTFcO5IXA6Vip",
  "1v9KwDbqtEHy5K3blEPzcmjd6IZ9g-LoO",
];

/** Named stills the homepage and section headers reuse. */
export const IMG = {
  meals: drive(GAZA_MEALS[0], 1200),
  parcels: drive(GAZA_PARCELS[0], 1200),
  bread: drive(GAZA_BREAD[0], 1200),
  water: drive(GAZA_WATER[0], 1200),
  quds: drive(QUDS_CITY[0], 1200),
  aqsa: drive(QUDS_IFTAR[0], 1200),
  redline: drive(QUDS_CITY[1], 1200),
  minber: drive(TRAVEL[0], 1200),
} as const;

export type ImageKey = keyof typeof IMG;

/** One photograph per project slug, from `Minbar/media.js` → `BY_SLUG`. */
const BY_SLUG: Record<string, string> = {
  "al-quds-friday-transport": TRAVEL[0],
  "gaza-food-parcels": GAZA_PARCELS[0],
  "gaza-hot-meals": GAZA_MEALS[0],
  "gaza-bread": GAZA_BREAD[0],
  "gaza-water": GAZA_WATER[0],
  "gaza-winter-relief": GAZA_PARCELS[1],
  "gaza-iftar": GAZA_MEALS[1],
  "gaza-zakat-al-fitr": GAZA_PARCELS[2],
  "al-quds-home-restoration": QUDS_CITY[1],
  "al-quds-family-relief": QUDS_IFTAR[0],
  "al-quds-education-sponsorship": QUDS_CITY[2],
  "al-quds-learning-centres": QUDS_CITY[3],
  "al-aqsa-quran-programmes": QUDS_IFTAR[1],
  "al-aqsa-lectures-and-pathways": QUDS_IFTAR[2],
  "al-quds-young-leaders": QUDS_CITY[4],
  "al-quds-olive-harvest": QUDS_CITY[5],
  "al-aqsa-umrah-visit": TRAVEL[0],
  "zakat-for-palestine": GAZA_PARCELS[3],
  "waqf-for-al-quds": QUDS_CITY[0],
  "monthly-palestine-support": QUDS_IFTAR[3],
  "al-quds-tahfiz-centres": QUDS_IFTAR[1],
  "al-aqsa-scholar-chairs": QUDS_IFTAR[2],
  "al-quds-waqf-school": QUDS_CITY[2],
  "al-quds-poor-families": QUDS_IFTAR[0],
  "al-quds-quran-forum": QUDS_CITY[3],
  "ibadan-masatib": QUDS_IFTAR[1],
  "ibadan-chairs": QUDS_CITY[2],
  "ibadan-quran-circles": QUDS_IFTAR[2],
  "ibadan-preacher": QUDS_CITY[4],
  "ibadan-trips": TRAVEL[0],
  "ibadan-inclusion": QUDS_CITY[5],
  "ibadan-mazamir": QUDS_IFTAR[4],
  "ibadan-contests": QUDS_CITY[3],
  "ibadan-camps": TRAVEL[1],
};

/** Photograph for a project, or `null` when none is genuinely associated. */
export function imageForSlug(slug: string | null | undefined, width = 1000): string | null {
  if (!slug) return null;
  const id = BY_SLUG[slug];
  return id ? drive(id, width) : null;
}

/** Regional galleries used by the "from the field" strips. */
const BANKS: Record<string, string[]> = {
  gaza: [...GAZA_MEALS, ...GAZA_PARCELS, ...GAZA_BREAD, ...GAZA_WATER],
  // QUDS_CITY is excluded from the field galleries on purpose: those frames are
  // interiors of the Journey-to-Al-Aqsa coach (with route markers), not general
  // Al-Quds / Al-Aqsa project photography.
  "al-quds": [...QUDS_IFTAR],
  "al-aqsa": [...QUDS_IFTAR],
  global: [...TRAVEL, ...GAZA_PARCELS],
};

/**
 * A gallery for a region. There is no genuine field-photo bank for Syria, Sudan
 * or the global qurbani programme yet — those are deliberately left without
 * images rather than borrowing Gaza's or Al-Quds'.
 */
export function galleryFor(region: string, count = 6, width = 700): string[] {
  const bank = BANKS[region];
  if (!bank) return [];
  return Array.from({ length: count }, (_, i) => drive(bank[i % bank.length], width));
}

/** YouTube poster frame for a video id. */
export const youtubeThumb = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

/** Watch URL for a video, with an optional start offset in seconds. */
export const youtubeWatch = (id: string, start?: number) =>
  `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}`;

/** Embed URL. `autoplay` is only ever used for a click-initiated modal. */
export const youtubeEmbed = (id: string, opts: { autoplay?: boolean; start?: number } = {}) => {
  const params = new URLSearchParams();
  if (opts.autoplay) params.set("autoplay", "1");
  if (opts.start) params.set("start", String(opts.start));
  const qs = params.toString();
  return `https://www.youtube.com/embed/${id}${qs ? `?${qs}` : ""}`;
};
