import { withDonationToken } from "./access-token-link";

/** Tab-scoped read access only: never donor/card data or a payment instruction. */
export const GUEST_DONATION_ACCESS_KEY = "mia_guest_donation_access_v1";
export const GUEST_DONATION_ACCESS_TTL_MS = 24 * 60 * 60 * 1000;
type TokenStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const validId = (id: string) => /^[a-f0-9]{24}$/i.test(id);
const validToken = (token: unknown): token is string =>
  typeof token === "string" && /^[a-z0-9_-]{32,256}$/i.test(token);

function browserStorage(): TokenStorage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

/** Remember only the credential the order API returned to this browser. */
export function rememberGuestDonationAccess(
  donationId: string, token: string | null | undefined,
  storage?: TokenStorage, now = Date.now(),
): boolean {
  if (!validId(donationId) || !validToken(token)) return false;
  try {
    const target = storage ?? browserStorage();
    if (!target) return false;
    target.setItem(GUEST_DONATION_ACCESS_KEY, JSON.stringify({ donationId, token, at: now }));
    return true;
  } catch {
    // Disabled storage must never prevent an order or gateway handoff.
    return false;
  }
}

export function readGuestDonationAccess(
  donationId: string, storage?: TokenStorage, now = Date.now(),
): string | null {
  if (!validId(donationId)) return null;
  try {
    const target = storage ?? browserStorage();
    const saved = JSON.parse(target?.getItem(GUEST_DONATION_ACCESS_KEY) ?? "null") as {
      donationId?: unknown; token?: unknown; at?: unknown;
    } | null;
    if (!saved || saved.donationId !== donationId) return null;
    if (!validToken(saved.token) || typeof saved.at !== "number" || !Number.isFinite(saved.at)
      || saved.at > now || now - saved.at >= GUEST_DONATION_ACCESS_TTL_MS) {
      target?.removeItem(GUEST_DONATION_ACCESS_KEY);
      return null;
    }
    return saved.token;
  } catch {
    return null;
  }
}

/** A link credential wins; otherwise recover only the matching last tab attempt. */
export function resolveGuestDonationAccess(donationId: string, presented?: string | null): string | null {
  return validToken(presented) ? presented : readGuestDonationAccess(donationId);
}

export function donationDetailsUrl(donationId: string, token?: string | null): string | null {
  if (!validId(donationId)) return null;
  return withDonationToken("/api/donations/" + donationId, resolveGuestDonationAccess(donationId, token));
}
