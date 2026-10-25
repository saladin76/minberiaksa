/** Private application routes, with or without the site's language prefix. */
const PRIVATE_PATH = /^(\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?)(api|dashboard|auth|account|profile|success|donation-failed|donation-pending|payment-failed|payment-pending|payment-processing|payment-cancelled|receipt|certificates|reset-password|verify-email)(?:\/|$)/i;

function decodedPath(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  try {
    const path = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    return path.startsWith("//") ? null : path;
  }
  catch { return null; }
}

/** Public content evidence only; account/payment/document routes are excluded. */
export function isPublicAnalyticsPath(value: string): boolean {
  const path = decodedPath(value);
  return path !== null && !PRIVATE_PATH.test(path);
}

/** Keep the kind of page, never the private identifier appended to its path. */
export function redactAnalyticsPath(value: string): string {
  const path = decodedPath(value);
  if (path === null) return "/";
  const match = PRIVATE_PATH.exec(path);
  return match ? match[1] + match[2] : value.split(/[?#]/, 1)[0];
}
