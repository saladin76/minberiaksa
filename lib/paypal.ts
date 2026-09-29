import "server-only";

import { convertAmountInCurrencyToUsd, normalizeDonationCurrencyCode } from "@/lib/exchange/convert-amount-in-currency-to-usd";

/**
 * PayPal Orders API v2  the server half of "Donate with PayPal".
 *
 * PayPal Wallet only: the donor is redirected to PayPal, signs in, picks a
 * funding source from their own account and comes back. No PayPal card
 * fields, Apple Pay or Google Pay are offered on the site.
 *
 * What PayPal is told about a donation is deliberately minimal: an amount, a
 * currency and our donation id as `custom_id`. No items, description, project
 * or campaign names ever leave the site  those stay in our database.
 *
 * The client secret is read here, on the server, and nowhere else. It must
 * never be put in a `NEXT_PUBLIC_*` variable.
 *
 * Env:
 *   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET   REST app credentials
 *   PAYPAL_BASE_URL                           https://api-m.paypal.com (live) or
 *                                             https://api-m.sandbox.paypal.com
 *   PAYPAL_RECURRING_ENABLED                  "0" turns PayPal plans off (default on)
 */

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

export function paypalConfig(env: NodeJS.ProcessEnv = process.env): PayPalConfig {
  return {
    clientId: (env.PAYPAL_CLIENT_ID ?? "").trim(),
    clientSecret: (env.PAYPAL_CLIENT_SECRET ?? "").trim(),
    baseUrl: (env.PAYPAL_BASE_URL ?? "https://api-m.paypal.com").trim().replace(/\/+$/, ""),
  };
}

export function isPayPalConfigured(cfg: PayPalConfig = paypalConfig()): boolean {
  return Boolean(cfg.clientId && cfg.clientSecret && cfg.baseUrl);
}

/**
 * Recurring PayPal plans vault the donor's wallet at the first payment. That
 * needs the PayPal account to be approved for vaulting; until it is, set
 * PAYPAL_RECURRING_ENABLED=0 so the checkout refuses a PayPal plan up front
 * instead of failing after the donor has been to PayPal.
 */
export function isPayPalRecurringEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isPayPalConfigured(paypalConfig(env)) && (env.PAYPAL_RECURRING_ENABLED ?? "1").trim() !== "0";
}

// ── Currency ────────────────────────────────────────────────────────────────

/** Currencies PayPal accepts for payments (developer.paypal.com/api/rest/reference/currency-codes). */
const PAYPAL_CURRENCIES = new Set([
  "AUD", "BRL", "CAD", "CNY", "CZK", "DKK", "EUR", "HKD", "HUF", "ILS", "JPY", "MYR", "MXN",
  "TWD", "NZD", "NOK", "PHP", "PLN", "GBP", "SGD", "SEK", "CHF", "THB", "USD",
]);
/** Currencies PayPal takes without decimals. */
const ZERO_DECIMAL = new Set(["HUF", "JPY", "TWD"]);

export function isPayPalCurrency(code: string): boolean {
  return PAYPAL_CURRENCIES.has(normalizeDonationCurrencyCode(code));
}

/** The amount as PayPal wants it: a string, two decimals (none for HUF/JPY/TWD). */
export function paypalValue(amount: number, currency: string): string {
  return ZERO_DECIMAL.has(currency) ? String(Math.round(amount)) : (Math.round(amount * 100) / 100).toFixed(2);
}

/**
 * What PayPal is asked to charge for a donation total in our currency: the
 * same currency when PayPal supports it, else USD at the site's own rate
 * (e.g. TRY, which PayPal does not process). The result is snapshotted on the
 * donation, and the capture is checked against that snapshot.
 */
export async function paypalChargeFor(total: number, currency: string): Promise<{ value: string; currency: string }> {
  const code = normalizeDonationCurrencyCode(currency);
  if (PAYPAL_CURRENCIES.has(code)) return { value: paypalValue(total, code), currency: code };
  const usd = await convertAmountInCurrencyToUsd(total, code);
  return { value: paypalValue(usd, "USD"), currency: "USD" };
}

/** Compare two PayPal amount strings numerically ("10.00" == "10.0"). */
export function paypalAmountsMatch(a: string | undefined, b: string | undefined): boolean {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.005;
}

// ── Transport ───────────────────────────────────────────────────────────────

let cachedToken: { value: string; expiresAt: number; key: string } | null = null;

async function accessToken(cfg: PayPalConfig): Promise<string> {
  const key = `${cfg.baseUrl}|${cfg.clientId}`;
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const res = await fetch(`${cfg.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string } | null;
  if (!res.ok || !data?.access_token) {
    throw new PayPalError(`PayPal authentication failed (${res.status}) ${data?.error_description ?? ""}`.trim(), res.status, data);
  }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 300) * 1000, key };
  return data.access_token;
}

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "PayPalError";
  }

  /** The first `details[].issue` PayPal returned, e.g. ORDER_ALREADY_CAPTURED. */
  get issue(): string | null {
    const details = (this.body as { details?: Array<{ issue?: string }> } | null)?.details;
    return details?.[0]?.issue ?? null;
  }
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  options: { body?: unknown; requestId?: string; cfg?: PayPalConfig } = {}
): Promise<T> {
  const cfg = options.cfg ?? paypalConfig();
  if (!isPayPalConfigured(cfg)) throw new PayPalError("PayPal is not configured", 503, null);
  const token = await accessToken(cfg);

  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      /* Makes a retried create or capture return the first result instead of
         doing it again (PayPal keeps the key for a limited time). */
      ...(options.requestId ? { "PayPal-Request-Id": options.requestId } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as T | null;
  if (!res.ok) {
    const name = (data as { name?: string; message?: string } | null)?.name ?? "";
    const message = (data as { message?: string } | null)?.message ?? "";
    throw new PayPalError(`PayPal ${method} ${path.split("?")[0]} failed (${res.status}) ${name} ${message}`.trim(), res.status, data);
  }
  return data as T;
}

// ── Orders ──────────────────────────────────────────────────────────────────

export interface PayPalMoney {
  currency_code: string;
  value: string;
}

export interface PayPalCapture {
  id: string;
  status: string;
  amount?: PayPalMoney;
  custom_id?: string;
  final_capture?: boolean;
}

export interface PayPalOrder {
  id: string;
  status: string;
  intent?: string;
  purchase_units?: Array<{
    custom_id?: string;
    amount?: PayPalMoney;
    payments?: { captures?: PayPalCapture[] };
  }>;
  payment_source?: {
    paypal?: {
      email_address?: string;
      account_id?: string;
      attributes?: { vault?: { id?: string; status?: string; customer?: { id?: string } } };
    };
  };
  links?: Array<{ href: string; rel: string; method?: string }>;
}

/**
 * Create the order the donor approves on PayPal. `vault` saves the wallet
 * for merchant-initiated charges later  set on a recurring plan's first
 * instalment only.
 */
export function createPayPalOrder(input: {
  donationId: string;
  value: string;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
  vault: boolean;
  requestId: string;
}): Promise<PayPalOrder> {
  return call<PayPalOrder>("POST", "/v2/checkout/orders", {
    requestId: input.requestId,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: input.donationId,
          amount: { currency_code: input.currency, value: input.value },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
            /* No `locale`: PayPal follows the donor's browser language, and a
               locale it does not support makes it refuse the whole order. */
          },
          ...(input.vault
            ? {
                attributes: {
                  vault: { store_in_vault: "ON_SUCCESS", usage_type: "MERCHANT", customer_type: "CONSUMER" },
                },
              }
            : {}),
        },
      },
    },
  });
}

export function capturePayPalOrder(orderId: string, requestId: string): Promise<PayPalOrder> {
  return call<PayPalOrder>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { requestId, body: {} });
}

export function getPayPalOrder(orderId: string): Promise<PayPalOrder> {
  return call<PayPalOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

/**
 * Charge a vaulted wallet without the donor present (a plan's later cycle).
 * PayPal captures such an order as part of creating it; a caller still gets
 * an order back and reads its capture.
 */
export function chargePayPalVault(input: {
  vaultId: string;
  customId: string;
  value: string;
  currency: string;
  requestId: string;
}): Promise<PayPalOrder> {
  return call<PayPalOrder>("POST", "/v2/checkout/orders", {
    requestId: input.requestId,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: input.customId,
          amount: { currency_code: input.currency, value: input.value },
        },
      ],
      payment_source: { paypal: { vault_id: input.vaultId } },
    },
  });
}

/** Where to send the donor to approve the order. */
export function paypalApproveUrl(order: PayPalOrder): string | null {
  const link = order.links?.find((l) => l.rel === "payer-action") ?? order.links?.find((l) => l.rel === "approve");
  return link?.href ?? null;
}

export function paypalCaptureOf(order: PayPalOrder): PayPalCapture | null {
  return order.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
}

export function paypalVaultOf(order: PayPalOrder): { id: string; customerId: string | null } | null {
  const vault = order.payment_source?.paypal?.attributes?.vault;
  return vault?.id ? { id: vault.id, customerId: vault.customer?.id ?? null } : null;
}

/** A PayPal response trimmed for `providerRaw`: ids, statuses, amounts  no payer details. */
export function paypalAuditView(order: PayPalOrder): Record<string, unknown> {
  const capture = paypalCaptureOf(order);
  const vault = paypalVaultOf(order);
  return {
    id: order.id,
    status: order.status,
    customId: order.purchase_units?.[0]?.custom_id ?? null,
    capture: capture ? { id: capture.id, status: capture.status, amount: capture.amount ?? null } : null,
    vault: vault ? { id: vault.id, status: order.payment_source?.paypal?.attributes?.vault?.status ?? null } : null,
  };
}
