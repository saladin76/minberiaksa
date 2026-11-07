import { imageSrcSet, imageUrl } from "./image-url";

/** An editor may use one cover for each language, but the original campaign
 * cover must remain available if the translated image is unavailable. */
export function selectProjectImages(
  localizedCover: string | null | undefined,
  campaignImages: readonly (string | null | undefined)[] | null | undefined,
): { cover: string | null; images: string[]; coverFallbacks: string[] } {
  const base = uniqueImageUrls(campaignImages ?? []);
  const localized = typeof localizedCover === "string" ? localizedCover.trim() : "";
  const cover = localized || base[0] || null;
  // Preserve the existing gallery order without duplicating the original
  // cover as a visible slide when the editor supplied a localized cover.
  const images = uniqueImageUrls([cover, ...(localized ? base.slice(1) : base)]);
  // The original cover can still be tried if a localized cover returns 403/404.
  // Other pictures of this SAME project come next, never unrelated stock photos.
  const coverFallbacks = base.filter((url) => url !== cover);
  return { cover, images, coverFallbacks };
}

function uniqueImageUrls(sources: readonly (string | null | undefined)[]): string[] {
  return [...new Set(sources
    .filter((url): url is string => typeof url === "string" && !!url.trim())
    .map((url) => url.trim()))];
}

export interface ProjectImageAttempt {
  src: string;
  srcSet?: string;
}

/** Try the bandwidth-saving URL first, then the untouched stored URL.
 * Some old Drive/Cloudinary assets do not accept rewritten transformations.
 * Only after both fail should we try another picture from the same campaign. */
export function projectImageAttempts(
  sources: readonly (string | null | undefined)[],
  width: number,
): ProjectImageAttempt[] {
  const attempts: ProjectImageAttempt[] = [];
  for (const original of uniqueImageUrls(sources)) {
    const optimized = imageUrl(original, width);
    if (optimized && optimized !== original) {
      attempts.push({ src: optimized, srcSet: imageSrcSet(original) });
    }
    attempts.push({ src: original });
  }
  return attempts;
}
