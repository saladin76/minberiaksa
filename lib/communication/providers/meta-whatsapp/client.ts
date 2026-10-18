import { getActiveMetaWhatsappRuntimeConfig, RUNTIME_FAILURE, type ActiveRuntimeConfig, type MetaWhatsappRuntimeValues } from "../../runtime-config";
import { META_REASONS } from "./errors";
import { graphFetch, type GraphErr, type GraphOk } from "./graph";
import { ensureWabaSubscriptionForConfig, type WabaSubscriptionResult } from "./subscription";
import type { HealthResult, MetaGraphConfig } from "./types";

export { graphFetch };
export type { WabaSubscriptionResult };

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

export type MetaPhoneCapacityResult =
  | {
      ok: true;
      displayPhoneNumber: string | null;
      qualityRating: string | null;
      messagingLimitTier: string | null;
    }
  | { ok: false; reason: string; detail?: string };

export async function getMetaPhoneCapacity(
  phoneNumberId: string,
  runtime?: MetaRuntimeConfig,
): Promise<MetaPhoneCapacityResult> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  if (!resolved.configured) return { ok: false, reason: metaRuntimeFailure(resolved) };

  // Meta exposes the current business-initiated messaging tier on the phone-number node for
  // eligible Cloud API numbers. Some accounts/API versions omit the field; callers must keep a
  // conservative configured fallback rather than failing campaign creation.
  const result = await graphFetch(
    resolved.values,
    `${phoneNumberId}?fields=display_phone_number,quality_rating,messaging_limit_tier`,
    { method: "GET" },
  );
  if (!result.ok) return { ok: false, reason: result.reason, detail: result.detail };
  const row = (result.data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    displayPhoneNumber: typeof row.display_phone_number === "string" ? row.display_phone_number : null,
    qualityRating: typeof row.quality_rating === "string" ? row.quality_rating : null,
    messagingLimitTier: typeof row.messaging_limit_tier === "string" ? row.messaging_limit_tier : null,
  };
}

/** `retryable` on a failure: see GraphErr  a temporary failure proves nothing about the sender. */
export type MetaSenderVerification =
  | { ok: true; displayPhoneNumber: string | null; qualityRating: string | null; verifiedName: string | null }
  | { ok: false; reason: string; detail?: string; retryable?: boolean };


export type MetaBusinessPortfolioAsset = {
  id: string;
  name: string | null;
  relationship: "OWNED" | "CLIENT";
};

export type MetaBusinessPortfolioAssetsResult =
  | { ok: true; businessId: string; businessName: string | null; wabas: MetaBusinessPortfolioAsset[] }
  | { ok: false; reason: string; detail?: string; retryable?: boolean };

async function graphRows(config: MetaGraphConfig, path: string): Promise<GraphOk | GraphErr> {
  return graphFetch(config, path, { method: "GET" });
}

/**
 * Resolve the root Business Portfolio and every WhatsApp Business Account it owns or has been
 * granted as a client asset. This is the authoritative boundary for this installation.
 */
export async function listBusinessPortfolioWabas(runtime?: MetaRuntimeConfig): Promise<MetaBusinessPortfolioAssetsResult> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  if (!resolved.configured) return { ok: false, reason: metaRuntimeFailure(resolved) };
  const config = resolved.values;
  const businessId = config.businessPortfolioId?.trim();
  if (!businessId) return { ok: false, reason: "META_BUSINESS_PORTFOLIO_NOT_CONFIGURED" };

  const business = await graphRows(config, `${businessId}?fields=id,name`);
  if (!business.ok) {
    return { ok: false, reason: "META_BUSINESS_PORTFOLIO_UNAVAILABLE", detail: business.detail, retryable: business.retryable };
  }
  const businessRow = business.data && typeof business.data === "object"
    ? business.data as Record<string, unknown>
    : {};

  const owned = await graphRows(config, `${businessId}/owned_whatsapp_business_accounts?fields=id,name&limit=200`);
  if (!owned.ok) {
    /* Listing a portfolio's WABAs needs business_management; the portfolio itself was readable. */
    const permissionMissing = !owned.retryable && (owned.status === 403 || /business_management|#200/i.test(owned.detail));
    return {
      ok: false,
      reason: permissionMissing ? BUSINESS_MANAGEMENT_PERMISSION_MISSING : "META_BUSINESS_PORTFOLIO_UNAVAILABLE",
      detail: owned.detail,
      retryable: owned.retryable,
    };
  }

  /*
   * Client WABAs are optional. Some portfolios have none and some tokens cannot enumerate that edge
   * even though owned assets are valid, so a failure here must not hide otherwise healthy owned WABAs.
   */
  const client = await graphRows(config, `${businessId}/client_whatsapp_business_accounts?fields=id,name&limit=200`);
  const extract = (payload: unknown, relationship: "OWNED" | "CLIENT"): MetaBusinessPortfolioAsset[] => {
    const rows = Array.isArray((payload as { data?: unknown[] } | null)?.data)
      ? ((payload as { data: unknown[] }).data as Array<Record<string, unknown>>)
      : [];
    return rows
      .map((row) => ({
        id: typeof row.id === "string" ? row.id : String(row.id ?? ""),
        name: typeof row.name === "string" ? row.name : null,
        relationship,
      }))
      .filter((row) => /^\d+$/.test(row.id));
  };

  const merged = new Map<string, MetaBusinessPortfolioAsset>();
  for (const row of extract(owned.data, "OWNED")) merged.set(row.id, row);
  if (client.ok) {
    for (const row of extract(client.data, "CLIENT")) if (!merged.has(row.id)) merged.set(row.id, row);
  }

  return {
    ok: true,
    businessId,
    businessName: typeof businessRow.name === "string" ? businessRow.name : null,
    wabas: [...merged.values()],
  };
}

const BUSINESS_MANAGEMENT_PERMISSION_MISSING = "META_BUSINESS_MANAGEMENT_PERMISSION_MISSING";

/**
 * The same portfolio check without business_management: a WABA names its owning business in
 * `owner_business_info`, which whatsapp_business_management can read. This proves ownership only;
 * a WABA merely shared with the portfolio as a client asset cannot be confirmed this way.
 */
async function verifyWabaOwnerDirectly(
  config: MetaGraphConfig,
  businessAccountId: string,
): Promise<{ ok: true; asset: MetaBusinessPortfolioAsset } | { ok: false; reason: string; detail?: string; retryable?: boolean }> {
  const businessId = config.businessPortfolioId?.trim() ?? "";
  const waba = await graphRows(config, `${businessAccountId}?fields=id,name,owner_business_info`);
  if (!waba.ok) return { ok: false, reason: waba.reason, detail: waba.detail, retryable: waba.retryable };
  const row = (waba.data ?? {}) as Record<string, unknown>;
  const owner = (row.owner_business_info ?? {}) as Record<string, unknown>;
  const ownerId = owner.id == null ? "" : String(owner.id);
  if (ownerId && ownerId === businessId) {
    return { ok: true, asset: { id: businessAccountId, name: typeof row.name === "string" ? row.name : null, relationship: "OWNED" } };
  }
  return {
    ok: false,
    reason: "META_WABA_NOT_IN_BUSINESS_PORTFOLIO",
    detail: ownerId
      ? `WABA ${businessAccountId} is owned by business ${ownerId}, not Business Portfolio ${businessId}. A client (shared) WABA can only be confirmed with business_management.`
      : `Meta did not report an owner for WABA ${businessAccountId}.`,
  };
}

export async function verifyWabaInBusinessPortfolio(
  businessAccountId: string,
  runtime?: MetaRuntimeConfig,
): Promise<{ ok: true; asset: MetaBusinessPortfolioAsset } | { ok: false; reason: string; detail?: string; retryable?: boolean }> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  const assets = await listBusinessPortfolioWabas(resolved);
  if (!assets.ok) {
    if (assets.reason !== BUSINESS_MANAGEMENT_PERMISSION_MISSING || !resolved.configured) return assets;
    return verifyWabaOwnerDirectly(resolved.values, businessAccountId);
  }
  const asset = assets.wabas.find((row) => row.id === businessAccountId);
  if (!asset) {
    return {
      ok: false,
      reason: "META_WABA_NOT_IN_BUSINESS_PORTFOLIO",
      detail: `WABA ${businessAccountId} is not owned/shared by Business Portfolio ${assets.businessId}.`,
    };
  }
  return { ok: true, asset };
}


export type MetaPortfolioPhoneAsset = {
  id: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
};

export type MetaPortfolioWabaWithPhones = MetaBusinessPortfolioAsset & {
  phones: MetaPortfolioPhoneAsset[];
};

export async function listBusinessPortfolioWhatsappAssets(
  runtime?: MetaRuntimeConfig,
): Promise<
  | { ok: true; businessId: string; businessName: string | null; wabas: MetaPortfolioWabaWithPhones[] }
  | { ok: false; reason: string; detail?: string }
> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  if (!resolved.configured) return { ok: false, reason: metaRuntimeFailure(resolved) };
  const base = await listBusinessPortfolioWabas(resolved);
  if (!base.ok) return base;

  const wabas: MetaPortfolioWabaWithPhones[] = [];
  for (const waba of base.wabas) {
    const phones = await graphFetch(
      resolved.values,
      `${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&limit=100`,
      { method: "GET" },
    );
    if (!phones.ok) {
      return {
        ok: false,
        reason: phones.reason,
        detail: `Unable to read phone numbers for WABA ${waba.id}: ${phones.detail}`,
      };
    }
    const rows = Array.isArray((phones.data as { data?: unknown[] } | null)?.data)
      ? ((phones.data as { data: unknown[] }).data as Array<Record<string, unknown>>)
      : [];
    wabas.push({
      ...waba,
      phones: rows
        .map((row) => ({
          id: typeof row.id === "string" ? row.id : String(row.id ?? ""),
          displayPhoneNumber: typeof row.display_phone_number === "string" ? row.display_phone_number : null,
          verifiedName: typeof row.verified_name === "string" ? row.verified_name : null,
          qualityRating: typeof row.quality_rating === "string" ? row.quality_rating : null,
        }))
        .filter((row) => /^\d+$/.test(row.id)),
    });
  }

  return { ok: true, businessId: base.businessId, businessName: base.businessName, wabas };
}

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
  if (!list.ok) return { ok: false, reason: list.reason, detail: list.detail, retryable: list.retryable };

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


/**
 * Ensure the configured Meta app is subscribed to a WABA's webhooks. Reads first and writes to
 * Meta only when the configured App ID is missing from `subscribed_apps`; see
 * `ensureWabaSubscriptionForConfig` for the full contract.
 */
export async function ensureWabaWebhookSubscription(
  businessAccountId: string,
  runtime?: MetaRuntimeConfig,
): Promise<WabaSubscriptionResult> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  if (!resolved.configured) return { ok: false, reason: metaRuntimeFailure(resolved), retryable: resolved.reason === RUNTIME_FAILURE.INTEGRATION_DATABASE_UNAVAILABLE };
  return ensureWabaSubscriptionForConfig(resolved.values, businessAccountId);
}
