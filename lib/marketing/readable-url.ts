/**
 * Human-readable version of a URL for display and copy/paste.
 *
 * Percent-encoded non-ASCII text (e.g. Arabic slugs, Arabic utm values) is
 * decoded so the link reads naturally, while every character that would change
 * the meaning of the URL stays encoded:
 *   - path segments keep whitespace, "?", "#", "%" and "/" encoded;
 *   - in the query string only runs that decode to purely non-ASCII text are
 *     decoded, so "&", "=", "+", "?", "#" and spaces keep their encoded form.
 *
 * The canonical (fully encoded) URL should still be used for href, storage and
 * matching. Invalid input is returned unchanged.
 */
const UNSAFE_IN_PATH = /[\s?#%/]/g;
const ENCODED_RUN = /(?:%[0-9A-F]{2})+/gi;
const ONLY_NON_ASCII = /^[^\x00-\x7F]+$/;
const INVISIBLE_OR_BIDI = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;

function decodeNonAsciiRuns(text: string): string {
  return text.replace(ENCODED_RUN, (run) => {
    try {
      const decoded = decodeURIComponent(run);
      // Keep invisible / bidi-control characters encoded so a link cannot look
      // different from where it actually goes.
      return ONLY_NON_ASCII.test(decoded) && !INVISIBLE_OR_BIDI.test(decoded) ? decoded : run;
    } catch {
      return run;
    }
  });
}

export function toReadableUrl(url: string): string {
  if (!url) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const path = parsed.pathname
    .split("/")
    .map((segment) => {
      let decoded: string;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return segment;
      }
      if (INVISIBLE_OR_BIDI.test(decoded)) return segment;
      return decoded.replace(UNSAFE_IN_PATH, (c) => encodeURIComponent(c));
    })
    .join("/");
  return `${parsed.origin}${path}${decodeNonAsciiRuns(parsed.search)}${decodeNonAsciiRuns(parsed.hash)}`;
}
