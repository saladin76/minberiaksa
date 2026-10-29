import { routeForPathname } from "../minbar/routes";
const SITE = "https://minberiaksa.org";
const DONATION_PAGES = new Set(["projects", "projectDetail", "zakat", "waqf", "recurring"]);

export function publicDonationUrl(value: string): URL | null {
  try {
    const url = new URL(value, SITE);
    if (url.protocol !== "https:" || !["minberiaksa.org", "www.minberiaksa.org"].includes(url.hostname) || url.username || url.password) return null;
    // Receipts, sign-in, private documents and payment callback URLs carry access credentials.
    if (/\/(?:api|dashboard|auth|login|receipt|certificates?|success|failure)(?:\/|$)/i.test(url.pathname)) return null;
    if ([...url.searchParams.keys()].some(key => /^(?:t|token|accessToken|signature|orderId|donationId)$/i.test(key))) return null;
    const page = routeForPathname(decodeURIComponent(url.pathname));
    if ((!page || !DONATION_PAGES.has(page)) && !/\/(?:projeler|projects|donate|donations|campaigns|zekatini-filistine-ode)(?:\/|$)/i.test(url.pathname)) return null;
    return url;
  } catch { return null; }
}
