import { publicDonationUrl } from "./campaign-public-url";

/** Only a NEW, operator-reviewed template may change Meta's approved URL.
 * Keep its donation destination and locale; reserve the terminal parameter for
 * the real campaign ID supplied by campaignTrackingValues at send time. */
export function trackedTemplateButtonUrl(value: string, locale: string): string | null {
  // Older templates used their sole URL variable for the recipient's language.
  // A template language is fixed, so it can become a literal in the new copy.
  const localized = value.replace(/([?&]language=)\{\{\s*1\s*\}\}(?=&|$)/g, `$1${locale}`);
  const concrete = localized.replace(/([?&]utm_id=)\{\{\s*1\s*\}\}$/g, "$1draft");
  if (/\{\{|\}\}/.test(concrete)) return null;
  const url = publicDonationUrl(concrete);
  if (!url || url.hash) return null;
  for (const key of ["utm_id", "utm_campaign", "campaign_id"]) url.searchParams.delete(key);
  url.searchParams.set("utm_source", "whatsapp");
  url.searchParams.set("utm_medium", "communication");
  // URLSearchParams encodes braces, but Meta requires the literal placeholder.
  return `${url.toString()}${url.search ? "&" : "?"}utm_id={{1}}`;
}

export function trackedTemplateButtons<T extends { type: string; url?: string; example?: string }>(buttons: T[], locale: string) {
  let prepared = 0;
  let unchanged = 0;
  const result = buttons.map(button => {
    if (button.type !== "URL" || !button.url) return { ...button };
    const url = trackedTemplateButtonUrl(button.url, locale);
    if (!url) { unchanged++; return { ...button }; }
    prepared++;
    return { ...button, url, example: url.replace("{{1}}", "000000000000000000000001") };
  });
  return { buttons: result, prepared, unchanged };
}
