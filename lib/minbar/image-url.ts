/**
 * A display-sized URL for an image the page paints itself  a CSS
 * `background-image` or a plain `<img>`  rather than through `next/image`.
 *
 * Those paths used to fetch the original upload: Cloudinary campaign photos of
 * 1–3 MB drawn into 300 px cards, a 2.5 MB footer photo, a 2508 px pattern tile
 * drawn at 300 px. PageSpeed counted ~7 MB of avoidable image bytes on the
 * homepage alone.
 *
 * - Cloudinary: a delivery transformation (`f_auto,q_auto,c_limit,w_…`), so
 *   Cloudinary resizes and serves AVIF/WebP from its own CDN.
 * - Local `/public` files: Next's image optimizer (`/_next/image`), the same
 *   endpoint `next/image` uses, cached for `images.minimumCacheTTL`.
 * - Anything else (YouTube thumbnails, other hosts) is returned unchanged:
 *   the optimizer refuses hosts outside `images.remotePatterns`, and an image
 *   that 400s is worse than one that is large.
 *
 * `width` is the CSS width the image is drawn at; it is doubled for high-DPI
 * screens and rounded up to one of the widths `next.config.ts` allows.
 */

/** `images.deviceSizes` + `images.imageSizes` in next.config.ts. */
const OPTIMIZER_WIDTHS = [16, 32, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920];
/** Next 16 only accepts the qualities listed in `images.qualities` (default `[75]`). */
const OPTIMIZER_QUALITY = 75;

const CLOUDINARY_UPLOAD_RE = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/;
const DRIVE_THUMB_RE = /^https:\/\/drive\.google\.com\/thumbnail\?id=([\w-]+)/;
const LH3_RE = /^https:\/\/lh3\.googleusercontent\.com\/d\/([\w-]+)(?:=[\w-]*)?$/;
const YOUTUBE_THUMB_RE = /^https:\/\/(?:img\.youtube\.com|i\.ytimg\.com)\/vi\/([\w-]{11})\/(\w+\.jpg)$/;
const PASSTHROUGH_EXT_RE = /\.(svg|gif)(\?|#|$)/i;

/** The smallest width `images.deviceSizes`/`imageSizes` allow that is at least `px`. */
function optimizerFit(px: number): number {
  return OPTIMIZER_WIDTHS.find((w) => w >= px) ?? OPTIMIZER_WIDTHS[OPTIMIZER_WIDTHS.length - 1];
}

/** Pixels needed to draw `cssWidth` sharply on a 2x screen. */
function targetWidth(cssWidth: number): number {
  return Math.ceil(cssWidth * 2);
}

/**
 * `src` resized to at least `width` pixels, or `null` when it cannot be resized.
 * Drive takes any width; Cloudinary, YouTube stills and local files round up to
 * the optimizer's list, so each image has a handful of cached variants.
 */
function resized(url: string, width: number): string | null {
  const cloudinary = url.match(CLOUDINARY_UPLOAD_RE);
  if (cloudinary) {
    // Already carries an automatic-format transformation  leave it alone.
    if (/(^|[,/])f_auto([,/]|$)/.test(cloudinary[2])) return null;
    return `${cloudinary[1]}f_auto,q_auto,c_limit,w_${optimizerFit(width)}/${cloudinary[2]}`;
  }

  // Drive thumbnails redirect to lh3.googleusercontent.com (and set a Google
  // cookie on the way). Going straight to the image host at the drawn size
  // skips the hop and the cookie, and a 64 px story circle stops fetching w1200.
  const driveId = url.match(DRIVE_THUMB_RE)?.[1] ?? url.match(LH3_RE)?.[1];
  // `-rw` asks the image host for WebP (about a third smaller than its JPEG).
  if (driveId) return `https://lh3.googleusercontent.com/d/${driveId}=w${width}-rw`;

  // YouTube stills are JPEGs cached for two hours. Through the optimizer
  // (`img.youtube.com` is in `images.remotePatterns`) they are AVIF/WebP and
  // cached like every other image.
  const yt = url.match(YOUTUBE_THUMB_RE);
  // `videoseries` (a playlist) is also eleven characters and has no still.
  if (yt && yt[1] !== "videoseries") {
    const still = `https://img.youtube.com/vi/${yt[1]}/${yt[2]}`;
    return `/_next/image?url=${encodeURIComponent(still)}&w=${optimizerFit(width)}&q=${OPTIMIZER_QUALITY}`;
  }

  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/_next/") && !PASSTHROUGH_EXT_RE.test(url)) {
    return `/_next/image?url=${encodeURIComponent(url)}&w=${optimizerFit(width)}&q=${OPTIMIZER_QUALITY}`;
  }

  return null;
}

export function imageUrl(src: string | null | undefined, width: number): string {
  if (!src) return "";
  const url = src.trim();
  return resized(url, targetWidth(width)) ?? url;
}

/**
 * A `srcSet` for an image drawn at a fluid width (pair it with `sizes`), or
 * `undefined` when the source cannot be resized.
 */
export function imageSrcSet(src: string | null | undefined, widths: readonly number[] = [640, 828, 1200, 1920]): string | undefined {
  if (!src) return undefined;
  const url = src.trim();
  if (!resized(url, widths[0])) return undefined;
  return widths.map((w) => `${resized(url, w)} ${w}w`).join(", ");
}

/** `imageUrl` wrapped for a CSS `background-image` / `background` value. */
export function cssImage(src: string | null | undefined, width: number): string {
  const url = imageUrl(src, width);
  return url ? `url('${url.replace(/'/g, "%27")}')` : "none";
}
