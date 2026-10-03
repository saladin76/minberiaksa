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


export type MetaBusinessPortfolioAsset = {
  id: string;
  name: string | null;
  relationship: "OWNED" | "CLIENT";
};

export type MetaBusinessPortfolioAssetsResult =
  | { ok: true; businessId: string; businessName: string | null; wabas: MetaBusinessPortfolioAsset[] }
  | { ok: false; reason: string; detail?: string };

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
    return { ok: false, reason: "META_BUSINESS_PORTFOLIO_UNAVAILABLE", detail: business.detail };
  }
  const businessRow = business.data && typeof business.data === "object"
    ? business.data as Record<string, unknown>
    : {};

  const owned = await graphRows(config, `${businessId}/owned_whatsapp_business_accounts?fields=id,name&limit=200`);
  if (!owned.ok) {
    return { ok: false, reason: "META_BUSINESS_PORTFOLIO_UNAVAILABLE", detail: owned.detail };
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

export type MetaWabaAccessDiagnostic = {
  wabaReadable: boolean;
  wabaName: string | null;
  assignedUserCount: number | null;
  directError: string | null;
  assignedUsersError: string | null;
};

async function diagnoseWabaAccess(
  businessAccountId: string,
  businessId: string,
  runtime: MetaRuntimeConfig,
): Promise<MetaWabaAccessDiagnostic> {
  if (!runtime.configured) {
    return {
      wabaReadable: false,
      wabaName: null,
      assignedUserCount: null,
      directError: metaRuntimeFailure(runtime),
      assignedUsersError: null,
    };
  }

  const direct = await graphFetch(runtime.values, `${businessAccountId}?fields=id,name`, { method: "GET" });
  let wabaReadable = false;
  let wabaName: string | null = null;
  let directError: string | null = null;

  if (direct.ok) {
    wabaReadable = true;
    const row = direct.data && typeof direct.data === "object"
      ? direct.data as Record<string, unknown>
      : {};
    wabaName = typeof row.name === "string" ? row.name : null;
  } else {
    directError = [direct.reason, direct.detail].filter(Boolean).join(" · ");
  }

  const assigned = await graphFetch(
    runtime.values,
    `${businessAccountId}/assigned_users?business=${encodeURIComponent(businessId)}`,
    { method: "GET" },
  );
  let assignedUserCount: number | null = null;
  let assignedUsersError: string | null = null;
  if (assigned.ok) {
    const rows = Array.isArray((assigned.data as { data?: unknown[] } | null)?.data)
      ? ((assigned.data as { data: unknown[] }).data)
      : [];
    assignedUserCount = rows.length;
  } else {
    assignedUsersError = [assigned.reason, assigned.detail].filter(Boolean).join(" · ");
  }

  return { wabaReadable, wabaName, assignedUserCount, directError, assignedUsersError };
}

export async function verifyWabaInBusinessPortfolio(
  businessAccountId: string,
  runtime?: MetaRuntimeConfig,
): Promise<{ ok: true; asset: MetaBusinessPortfolioAsset } | { ok: false; reason: string; detail?: string }> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  const assets = await listBusinessPortfolioWabas(resolved);
  if (!assets.ok) return assets;
  const asset = assets.wabas.find((row) => row.id === businessAccountId);
  if (!asset) {
    const diagnostic = await diagnoseWabaAccess(businessAccountId, assets.businessId, resolved);
    let detail = `WABA ${businessAccountId} is not returned by Business Portfolio ${assets.businessId}.`;

    if (!diagnostic.wabaReadable) {
      detail += " The current Access Token cannot read this WABA directly. Assign the System User/token owner to this WhatsApp account and regenerate a token with business_management, whatsapp_business_management and whatsapp_business_messaging.";
      if (diagnostic.directError) detail += ` Direct check: ${diagnostic.directError}.`;
    } else if (diagnostic.assignedUserCount === 0) {
      detail += ` Meta can read the WABA${diagnostic.wabaName ? ` “${diagnostic.wabaName}”` : ""}, but no system user from this Business Portfolio is assigned to it. Assign the System User with MANAGE or DEVELOP access, then regenerate/refresh the token.`;
    } else {
      detail += ` Meta can read the WABA${diagnostic.wabaName ? ` “${diagnostic.wabaName}”` : ""}, but it is not exposed by owned_whatsapp_business_accounts/client_whatsapp_business_accounts for this Business Portfolio. Review the WABA asset ownership/sharing and System User assignment in Meta Business Settings.`;
      if (diagnostic.assignedUsersError) detail += ` assigned_users check: ${diagnostic.assignedUsersError}.`;
    }

    return {
      ok: false,
      reason: "META_WABA_NOT_IN_BUSINESS_PORTFOLIO",
      detail,
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


export type WabaSubscriptionResult =
  | { ok: true; subscribed: true; changed: boolean; appIds: string[] }
  | { ok: false; reason: string; detail?: string };

/**
 * Ensure the active Meta app is subscribed to a WABA's webhooks.
 *
 * Meta's callback URL lives on the app, but delivery/inbound events are only emitted for WABAs to
 * which the app is subscribed. A sender is therefore not considered production-ready until this
 * succeeds. The POST is idempotent from our perspective and Meta returns { success: true }.
 */
export async function ensureWabaWebhookSubscription(
  businessAccountId: string,
  runtime?: MetaRuntimeConfig,
): Promise<WabaSubscriptionResult> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  if (!resolved.configured) return { ok: false, reason: metaRuntimeFailure(resolved) };
  const config = resolved.values;

  const current = await graphFetch(config, `${businessAccountId}/subscribed_apps`, { method: "GET" });
  if (!current.ok) return { ok: false, reason: current.reason, detail: current.detail };

  const data = Array.isArray((current.data as { data?: unknown[] } | null)?.data)
    ? ((current.data as { data: unknown[] }).data as Array<Record<string, unknown>>)
    : [];
  const appIds = data
    .map((row) => {
      const wa = row.whatsapp_business_api_data as Record<string, unknown> | undefined;
      return typeof wa?.id === "string" ? wa.id : null;
    })
    .filter((id): id is string => Boolean(id));

  /*
   * We do not know the app id independently from the access token/runtime settings, and Meta does
   * not expose it as a required local setting. If any subscription exists, the current token has
   * access to the subscription edge, but it could still be a different app. POSTing is cheap and
   * idempotent, so we always ensure the active app is subscribed rather than guessing by name/id.
   */
  const subscribe = await graphFetch(config, `${businessAccountId}/subscribed_apps`, { method: "POST" });
  if (!subscribe.ok) return { ok: false, reason: subscribe.reason, detail: subscribe.detail };
  const ok = (subscribe.data as { success?: unknown } | null)?.success;
  if (ok !== true) {
    return { ok: false, reason: META_REASONS.INVALID_RESPONSE, detail: "Meta did not confirm WABA webhook subscription." };
  }

  const verify = await graphFetch(config, `${businessAccountId}/subscribed_apps`, { method: "GET" });
  if (!verify.ok) return { ok: false, reason: verify.reason, detail: verify.detail };
  const verifiedRows = Array.isArray((verify.data as { data?: unknown[] } | null)?.data)
    ? ((verify.data as { data: unknown[] }).data as Array<Record<string, unknown>>)
    : [];
  const verifiedAppIds = verifiedRows
    .map((row) => {
      const wa = row.whatsapp_business_api_data as Record<string, unknown> | undefined;
      const nested = typeof wa?.id === "string" ? wa.id : null;
      const top = typeof row.id === "string" ? row.id : null;
      return nested ?? top;
    })
    .filter((id): id is string => Boolean(id));

  if (!verifiedRows.length) {
    return { ok: false, reason: META_REASONS.INVALID_RESPONSE, detail: "WABA has no subscribed apps after subscription request." };
  }
  const expectedAppId = config.appId?.trim();
  if (expectedAppId && !verifiedAppIds.includes(expectedAppId)) {
    return {
      ok: false,
      reason: "META_WABA_APP_SUBSCRIPTION_MISMATCH",
      detail: `The configured Meta app ${expectedAppId} is not listed in WABA subscribed_apps after the subscription request.`,
    };
  }
  return { ok: true, subscribed: true, changed: true, appIds: verifiedAppIds.length ? verifiedAppIds : appIds };
}
