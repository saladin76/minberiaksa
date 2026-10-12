/**
 * Carries the incoming query string onto a server redirect.
 *
 * Ad clicks land with `utm_*`, `gclid`, `fbclid` and the like, and the tracking
 * scripts only read them once the final page has loaded. A redirect that drops
 * the query loses the campaign before anything can store it.
 */
export type IncomingSearchParams = Record<string, string | string[] | undefined>;

export function withIncomingQuery(path: string, searchParams: IncomingSearchParams | undefined): string {
  if (!searchParams) return path;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) qs.append(key, v);
  }
  const query = qs.toString();
  if (!query) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}
