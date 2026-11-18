/**
 * "Field moments" gallery: shared, dependency-free helpers for the public
 * section and the dashboard manager (owner request, 2026-11-18).
 */
export type GalleryCaptions = Partial<Record<"ar" | "tr" | "en" | "fr", string>>;
export type GalleryImage = { id: string; url: string; captions: GalleryCaptions; visible: boolean; order: number; createdAt: string };
export type PublicGalleryImage = Pick<GalleryImage, "id" | "url" | "captions">;

/** Only images we host on Cloudinary are accepted (they are what /api/upload returns). */
export function isGalleryImageUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= 600 && /^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\/[^\s"'<>]+$/i.test(value);
}

/** A Cloudinary delivery variant: the transformation goes right after "/upload/". */
export function galleryVariant(url: string, kind: "thumb" | "full" | "email"): string {
  const transform = kind === "thumb" ? "c_fill,g_auto,w_640,h_480,q_auto,f_auto"
    : kind === "full" ? "c_limit,w_1600,q_auto,f_auto"
    : "c_limit,w_600,q_auto:good,f_jpg"; // e-mail clients: a plain JPEG, 600 px wide
  return url.replace(/\/image\/upload\/(?:[a-z]_[^/]*\/)?/i, `/image/upload/${transform}/`);
}

/** Ready-to-paste HTML for an e-mail template. */
export function galleryEmailHtml(url: string, alt = ""): string {
  const safeAlt = alt.replace(/[<>"&]/g, "");
  return `<img src="${galleryVariant(url, "email")}" width="600" alt="${safeAlt}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:8px;" />`;
}

const TEXTS = {
  ar: { title: "لقطات من الميدان", close: "إغلاق", next: "التالي", previous: "السابق" },
  tr: { title: "Sahadan Kareler", close: "Kapat", next: "Sonraki", previous: "Önceki" },
  en: { title: "Moments from the Field", close: "Close", next: "Next", previous: "Previous" },
  fr: { title: "Instants du terrain", close: "Fermer", next: "Suivant", previous: "Précédent" },
} as const;
/** Arabic, Turkish, English, French; other languages read English. */
export function galleryTexts(locale: string) {
  const l = locale.slice(0, 2).toLowerCase();
  return l === "ar" || l === "tr" || l === "fr" ? TEXTS[l] : TEXTS.en;
}
export function galleryCaption(captions: GalleryCaptions, locale: string): string {
  const l = locale.slice(0, 2).toLowerCase() as keyof GalleryCaptions;
  return (captions[l] || captions.en || captions.ar || "").trim();
}

/** Pages where the gallery would distract a donor who is paying, or has no place. */
export function galleryHiddenOn(pathname: string): boolean {
  return /^\/[a-z]{2}\/(?:checkout|cart|success|payment-pending|payment-cancelled|auth|error|account)(?:\/|$)/i.test(pathname);
}
export const GALLERY_PUBLIC_LIMIT = 12;
