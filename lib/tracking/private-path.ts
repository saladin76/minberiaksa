/** Private application routes, with or without the site's language prefix. */
const PRIVATE_PATH = /^(\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?)(api|dashboard|auth|account|profile|cart|checkout|recurring-donation|subscription|subscriptions|login|register|success|donation-failed|donation-pending|payment-failed|payment-pending|payment-processing|payment-cancelled|receipt|certificates|reset-password|verify-email)(?:\/|$)/i;

function decodedPath(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  try {
    // Nested percent encoding must not turn a protected route into a public
    // analytics route (e.g. /ar/%2563heckout -> /ar/checkout).
    let path = value.split(/[?#]/, 1)[0];
    for (let depth = 0; depth < 4; depth++) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    }
    // Fail closed if still encoded after the bounded decode, or if decoding
    // produced an external/protocol-relative path.
    return path.startsWith("//") || /%[0-9a-f]{2}/i.test(path) ? null : path;
  }
  catch { return null; }
}

/** Public content evidence only; account/payment/document routes are excluded. */
/** Reject URLs containing personal, payment or authentication parameters.
 * Attribution UTM and campaign parameters remain eligible for public analytics. */
function hasSensitiveQuery(value: string): boolean {
  const query = value.split("?", 2)[1]?.split("#", 1)[0];
  if (!query) return false;
  try {
    for (const key of new URLSearchParams(query).keys()) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (/(?:token|secret|password|passwd|email|phone|mobile|session|credential|authorization|paymentintent|donationid|receiptid|transactionid|userid|customerid|otp|authcode|verificationcode|accesskey)/.test(normalized) ||
          /^(?:code|state|key|auth|id)$/.test(normalized)) return true;
    }
    return false;
  } catch { return true; }
}

export function isPublicAnalyticsPath(value: string): boolean {
  const path = decodedPath(value);
  return path !== null && !PRIVATE_PATH.test(path) && !hasSensitiveQuery(value);
}

/** Keep the kind of page, never the private identifier appended to its path. */
export function redactAnalyticsPath(value: string): string {
  const path = decodedPath(value);
  if (path === null) return "/";
  const match = PRIVATE_PATH.exec(path);
  return match ? match[1] + match[2] : value.split(/[?#]/, 1)[0];
}
