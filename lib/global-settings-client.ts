/**
 * Client-side fetch + in-memory cache for /api/global-settings.
 *
 * Returns both the team-support quick-pick defaults and the payforEnabled
 * master switch in a single response. One in-flight fetch is shared across
 * all callers so opening multiple dialogs in quick succession doesn't fan
 * out into duplicate requests.
 */

import {
  parseSuggestedTeamSupport,
  type SuggestedTeamSupportConfig,
} from "./campaign/suggested-team-support";
import { parseMainGateway, type MainGateway } from "./payment-gateway";

export type GlobalSettings = {
  suggestedTeamSupport: SuggestedTeamSupportConfig;
  /** Master switch for the PayFor gateway. Default true. */
  payforEnabled: boolean;
  /** Gateway handling every case PayFor doesn't take. Default "STRIPE". */
  mainGateway: MainGateway;
  /**
   * True when Albaraka is set up to collect the card on its own hosted page.
   * The checkout dialogs must then skip our card form entirely — Albaraka signs
   * the card fields into the request MAC, so a card we collect locally would
   * have to be posted to our server to be signed.
   */
  albarakaUseOOS: boolean;
  /** False when ALBARAKA_ENC_KEY is missing, i.e. the gateway can't sign anything. */
  albarakaConfigured: boolean;
};

let cached: GlobalSettings | null = null;
let inFlight: Promise<GlobalSettings | null> | null = null;

/** Latest cached value, or null if not yet fetched. */
export function getCachedGlobalSettings(): GlobalSettings | null {
  return cached;
}

/**
 * Fetch global settings. Cached after first call; pass `{ force: true }` to
 * bypass the cache (e.g. after an admin save).
 */
export async function fetchGlobalSettings(
  { force = false }: { force?: boolean } = {}
): Promise<GlobalSettings | null> {
  if (!force && cached) return cached;
  if (!force && inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch("/api/global-settings", {
        credentials: "omit",
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = (await res.json().catch(() => null)) as
        | {
            suggestedTeamSupport?: unknown;
            payforEnabled?: unknown;
            mainGateway?: unknown;
            albarakaUseOOS?: unknown;
            albarakaConfigured?: unknown;
          }
        | null;
      const parsed: GlobalSettings = {
        suggestedTeamSupport: parseSuggestedTeamSupport(data?.suggestedTeamSupport),
        // Treat anything that isn't an explicit `false` as enabled. This keeps
        // the donation flow working before the first record is persisted and
        // when the API response shape is incomplete for any reason.
        payforEnabled: data?.payforEnabled !== false,
        // Anything unrecognised falls back to Stripe — the rail that always works.
        mainGateway: parseMainGateway(data?.mainGateway),
        albarakaUseOOS: data?.albarakaUseOOS === true,
        albarakaConfigured: data?.albarakaConfigured === true,
      };
      cached = parsed;
      return parsed;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
