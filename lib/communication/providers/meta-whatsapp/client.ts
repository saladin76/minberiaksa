import { getActiveMetaWhatsappRuntimeConfig, RUNTIME_FAILURE, type ActiveRuntimeConfig, type MetaWhatsappRuntimeValues } from "../../runtime-config";
import { mapGraphError, META_REASONS } from "./errors";
import type { HealthResult, MetaGraphConfig } from "./types";

export type MetaRuntimeConfig = ActiveRuntimeConfig<MetaWhatsappRuntimeValues>;

export async function getMetaConfig(runtime?: MetaRuntimeConfig): Promise<MetaGraphConfig | null> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  if (!resolved.configured) return null;
  return resolved.values;
}

export async function isMetaConfigured(runtime?: MetaRuntimeConfig): Promise<boolean> {
  return (runtime ?? await getActiveMetaWhatsappRuntimeConfig()).configured;
}

export function metaRuntimeFailure(runtime: MetaRuntimeConfig): string {
  if (runtime.configured) return META_REASONS.NOT_CONFIGURED;
  if (runtime.reason === RUNTIME_FAILURE.PROVIDER_DISABLED) return "PROVIDER_DISABLED";
  if (runtime.reason === RUNTIME_FAILURE.INTEGRATION_DECRYPTION_FAILED) return "INTEGRATION_DECRYPTION_FAILED";
  if (runtime.reason === RUNTIME_FAILURE.INTEGRATION_DATABASE_UNAVAILABLE) return "INTEGRATION_DATABASE_UNAVAILABLE";
  return META_REASONS.NOT_CONFIGURED;
}

type GraphOk = { ok: true; data: unknown };
type GraphErr = { ok: false; reason: string; detail: string };

export async function graphFetch(config: MetaGraphConfig, path: string, init?: RequestInit): Promise<GraphOk | GraphErr> {
  const url = `https://graph.facebook.com/${config.graphVersion}/${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const { reason, detail } = mapGraphError(res.status, body);
      return { ok: false, reason, detail };
    }
    return { ok: true, data: body };
  } catch {
    return { ok: false, reason: META_REASONS.REQUEST_FAILED, detail: "network error" };
  }
}

export type MetaSenderVerification =
  | { ok: true; displayPhoneNumber: string | null; qualityRating: string | null; verifiedName: string | null }
  | { ok: false; reason: string; detail?: string };

/**
 * Verify that a Phone Number ID is both accessible with the active Meta connection and owned by the
 * WABA configured on the sender. This closes the gap where a syntactically valid numeric ID could be
 * saved as ACTIVE even though it belonged to another account (or to no accessible account at all).
 */
export async function verifySenderOwnership(
  phoneNumberId: string,
  businessAccountId: string,
  runtime?: MetaRuntimeConfig
): Promise<MetaSenderVerification> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  if (!resolved.configured) return { ok: false, reason: metaRuntimeFailure(resolved) };
  const config = resolved.values;

  const list = await graphFetch(
    config,
    `${businessAccountId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&limit=100`,
    { method: "GET" }
  );
  if (!list.ok) return { ok: false, reason: list.reason, detail: list.detail };

  const rows = Array.isArray((list.data as { data?: unknown[] } | null)?.data)
    ? ((list.data as { data: unknown[] }).data as Array<Record<string, unknown>>)
    : [];
  const match = rows.find((row) => String(row.id ?? "") === phoneNumberId);
  if (!match) {
    return {
      ok: false,
      reason: META_REASONS.PHONE_NOT_IN_WABA,
      detail: "Phone Number ID is not attached to the selected WhatsApp Business Account.",
    };
  }

  return {
    ok: true,
    displayPhoneNumber: typeof match.display_phone_number === "string" ? match.display_phone_number : null,
    qualityRating: typeof match.quality_rating === "string" ? match.quality_rating : null,
    verifiedName: typeof match.verified_name === "string" ? match.verified_name : null,
  };
}

export async function healthCheck(phoneNumberId?: string | null, runtime?: MetaRuntimeConfig): Promise<HealthResult> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  if (!resolved.configured) return { ok: false, reason: metaRuntimeFailure(resolved) };
  const config = resolved.values;
  const pnid = phoneNumberId || config.defaultPhoneNumberId;
  if (!pnid) return { ok: false, reason: META_REASONS.SENDER_MISSING_PHONE_NUMBER_ID };
  const result = await graphFetch(config, `${pnid}?fields=verified_name,quality_rating,display_phone_number`, { method: "GET" });
  if (!result.ok) return { ok: false, reason: result.reason, detail: result.detail };
  const d = (result.data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    displayPhoneNumber: typeof d.display_phone_number === "string" ? d.display_phone_number : null,
    qualityRating: typeof d.quality_rating === "string" ? d.quality_rating : null,
    verifiedName: typeof d.verified_name === "string" ? d.verified_name : null,
  };
}
