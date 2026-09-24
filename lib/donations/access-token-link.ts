/**
 * The browser-safe half of `lib/donations/access-token.ts`: how a donation's
 * guest access token travels on a link. No crypto here, so client components
 * (checkout, the success page's document links, the legacy dialogs) can
 * import it without pulling Node's `crypto` into the bundle.
 */

/** Query key the token travels under. */
export const DONATION_TOKEN_PARAM = "t";

/** `path` with the token appended — as `?t=` or `&t=` — or unchanged when there is none. */
export function withDonationToken(path: string, token: string | null | undefined): string {
  if (!token) return path;
  const [base, hash = ""] = path.split("#");
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}${DONATION_TOKEN_PARAM}=${encodeURIComponent(token)}${hash ? `#${hash}` : ""}`;
}
