import { graphFetch, graphFetchAllPages, type GraphRow } from "./graph";
import type { MetaGraphConfig } from "./types";

export const WABA_SUBSCRIPTION_REASONS = {
  APP_ID_NOT_CONFIGURED: "META_WHATSAPP_APP_ID_NOT_CONFIGURED",
  APP_SUBSCRIPTION_MISMATCH: "META_WABA_APP_SUBSCRIPTION_MISMATCH",
  SUBSCRIBE_NOT_CONFIRMED: "META_WABA_SUBSCRIBE_NOT_CONFIRMED",
} as const;

export type WabaSubscriptionResult =
  | { ok: true; subscribed: true; changed: boolean; appIds: string[] }
  | { ok: false; reason: string; detail?: string; retryable: boolean };

/**
 * App ids listed on a WABA's `subscribed_apps` edge. Meta nests the app under
 * `whatsapp_business_api_data`; older responses carry it as the row's own `id`. Both are read,
 * nested first, and duplicates collapse  a row that names the same app twice is still one app.
 */
export function extractSubscribedAppIds(rows: readonly GraphRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const nested = row.whatsapp_business_api_data;
    const nestedId = nested && typeof nested === "object" ? (nested as Record<string, unknown>).id : undefined;
    const raw = nestedId ?? row.id;
    const id = typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : "";
    if (id) ids.add(id);
  }
  return [...ids];
}

async function readSubscribedAppIds(config: MetaGraphConfig, businessAccountId: string) {
  const page = await graphFetchAllPages(config, `${businessAccountId}/subscribed_apps`);
  if (!page.ok) return page;
  return { ok: true as const, appIds: extractSubscribedAppIds(page.rows) };
}

/**
 * Make sure the configured Meta app  and specifically that app  receives this WABA's webhooks.
 *
 * Meta's callback URL lives on the app, but message/status events are only delivered for WABAs the
 * app is subscribed to. The configured App ID is the identity being checked, so:
 *
 *  - already subscribed  answered from the read alone, with no write to Meta (`changed: false`).
 *    Re-verifying a healthy sender must never depend on a POST it does not need.
 *  - not subscribed      POST, then read again; success only once the configured App ID appears
 *    (`changed: true`). A `{success:true}` from the POST, an empty list, or some other app on the
 *    WABA is not proof.
 *  - no App ID           a configuration error, never an unproven success.
 */
export async function ensureWabaSubscriptionForConfig(
  config: MetaGraphConfig,
  businessAccountId: string,
): Promise<WabaSubscriptionResult> {
  const appId = config.appId?.trim();
  if (!appId) {
    return {
      ok: false,
      reason: WABA_SUBSCRIPTION_REASONS.APP_ID_NOT_CONFIGURED,
      detail: "Meta App ID is required to confirm which app is subscribed to the WABA.",
      retryable: false,
    };
  }

  const current = await readSubscribedAppIds(config, businessAccountId);
  if (!current.ok) return { ok: false, reason: current.reason, detail: current.detail, retryable: current.retryable };
  if (current.appIds.includes(appId)) {
    return { ok: true, subscribed: true, changed: false, appIds: current.appIds };
  }

  const subscribe = await graphFetch(config, `${businessAccountId}/subscribed_apps`, { method: "POST" });
  if (!subscribe.ok) return { ok: false, reason: subscribe.reason, detail: subscribe.detail, retryable: subscribe.retryable };
  if ((subscribe.data as { success?: unknown } | null)?.success !== true) {
    return {
      ok: false,
      reason: WABA_SUBSCRIPTION_REASONS.SUBSCRIBE_NOT_CONFIRMED,
      detail: "Meta did not confirm the WABA webhook subscription request.",
      retryable: false,
    };
  }

  const after = await readSubscribedAppIds(config, businessAccountId);
  if (!after.ok) return { ok: false, reason: after.reason, detail: after.detail, retryable: after.retryable };
  if (!after.appIds.includes(appId)) {
    return {
      ok: false,
      reason: WABA_SUBSCRIPTION_REASONS.APP_SUBSCRIPTION_MISMATCH,
      detail: after.appIds.length
        ? `Configured Meta app ${appId} is not among the WABA's subscribed apps (${after.appIds.join(", ")}) after the subscription request.`
        : `WABA lists no subscribed apps after the subscription request; configured Meta app is ${appId}.`,
      retryable: false,
    };
  }
  return { ok: true, subscribed: true, changed: true, appIds: after.appIds };
}
