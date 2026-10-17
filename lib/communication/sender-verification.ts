/**
 * What one WhatsApp sender verification attempt does to the stored sender, and what the dashboard is
 * told about it. Pure  no Prisma, no network  so the policy can be tested on its own.
 *
 * The rule this exists for: a verification attempt is evidence only of what it proved.
 *
 *  - A confirmed failure (number not in the WABA, WABA outside the Business Portfolio, the configured
 *    app not subscribed, required settings missing, Meta rejecting the credentials) takes the sender
 *    out of routing, as it always has, with the stage and reason recorded.
 *  - A temporary failure (network, Meta 5xx, throttling, the settings database briefly unreachable)
 *    proves nothing about the sender, so its operational state is left exactly as it was and only
 *    the failed attempt is recorded.
 *  - The provider being switched off inside this system is an internal state, not a verdict on the
 *    number from Meta, and is reported as such without touching the sender.
 *  - Success never overrides an operator's deliberate disable.
 */

export type VerificationStage = "CONFIGURATION" | "BUSINESS_PORTFOLIO" | "PHONE_OWNERSHIP" | "WEBHOOK_SUBSCRIPTION";

export type VerificationFailureKind =
  | "PROVIDER_DISABLED"
  | "INTERNAL_UNAVAILABLE"
  | "CONFIGURATION_MISSING"
  | "OWNERSHIP"
  | "APP_SUBSCRIPTION"
  | "META_REJECTED"
  | "TRANSIENT";

/** The machine-readable part of a verification failure the API returns next to `error`. */
export type VerificationDiagnostic = {
  stage: VerificationStage;
  reason: string;
  detail: string | null;
  retryable: boolean;
};

/** The structured record kept on `CommunicationSender.metadata.verification`. */
export type VerificationRecord = {
  lastAttemptAt: string;
  ok: boolean;
  stage: VerificationStage | null;
  reason: string | null;
  detail: string | null;
  retryable: boolean;
  /** Webhook state at the last successful check. */
  webhookSubscriptionChanged?: boolean;
};

/** The slice of a stored sender this policy reads. */
export type SenderVerificationState = {
  status: string;
  enabled: boolean;
  metadata: unknown;
};

export type SenderStatePatch = {
  status?: string;
  enabled?: boolean;
  lastError?: string | null;
  lastHealthCheckAt?: Date;
};

export type VerificationFailureInput = {
  stage: VerificationStage;
  reason: string;
  detail?: string | null;
  retryable?: boolean;
};

export type VerificationFailurePlan = {
  kind: VerificationFailureKind;
  httpStatus: number;
  error: string;
  diagnostic: VerificationDiagnostic;
  /** `null`: the sender's status / enabled / lastError are left as they were. */
  senderPatch: SenderStatePatch | null;
  record: VerificationRecord;
};

const CONFIGURATION_MISSING_REASONS = new Set([
  "META_WHATSAPP_NOT_CONFIGURED",
  "META_BUSINESS_PORTFOLIO_NOT_CONFIGURED",
  "META_WHATSAPP_APP_ID_NOT_CONFIGURED",
]);
const OWNERSHIP_REASONS = new Set(["META_WABA_NOT_IN_BUSINESS_PORTFOLIO", "META_WHATSAPP_PHONE_NOT_IN_WABA"]);
const APP_SUBSCRIPTION_REASONS = new Set(["META_WABA_APP_SUBSCRIPTION_MISMATCH", "META_WABA_SUBSCRIBE_NOT_CONFIRMED"]);

export const VERIFICATION_MESSAGES = {
  PROVIDER_DISABLED: "مزود Meta WhatsApp غير مفعّل داخل النظام",
  INTERNAL_UNAVAILABLE: "تعذّر قراءة إعدادات تكامل Meta داخل النظام. لم تتغير حالة المُرسِل.",
  CONFIGURATION_MISSING: "إعدادات Meta WhatsApp غير مكتملة.",
  BUSINESS_PORTFOLIO: "واجهة WABA غير تابعة لحساب الأعمال الرئيسي.",
  PHONE_OWNERSHIP: "رقم الهاتف غير مرتبط بواجهة WABA المحددة.",
  APP_SUBSCRIPTION: "تطبيق Meta المحدد في الإعدادات غير مشترك في Webhook لهذه الواجهة.",
  META_REJECTED: "رفضت Meta طلب التحقق.",
  TRANSIENT: "تعذّر التحقق مؤقتًا من Meta. لم تتغير حالة المُرسِل؛ أعد المحاولة لاحقًا.",
  VERIFIED: "تم التحقق من الرقم وWABA عبر Meta وتفعيل المُرسِل.",
  VERIFIED_ADMIN_HOLD: "تم التحقق من الرقم وWABA عبر Meta. بقي المُرسِل معطّلًا كما ضبطه المشرف.",
} as const;

function classify(input: VerificationFailureInput): { kind: VerificationFailureKind; stage: VerificationStage; retryable: boolean } {
  const { reason } = input;
  if (reason === "PROVIDER_DISABLED") return { kind: "PROVIDER_DISABLED", stage: "CONFIGURATION", retryable: false };
  if (reason === "INTEGRATION_DATABASE_UNAVAILABLE") return { kind: "INTERNAL_UNAVAILABLE", stage: "CONFIGURATION", retryable: true };
  if (reason === "INTEGRATION_DECRYPTION_FAILED") return { kind: "INTERNAL_UNAVAILABLE", stage: "CONFIGURATION", retryable: false };
  if (CONFIGURATION_MISSING_REASONS.has(reason)) return { kind: "CONFIGURATION_MISSING", stage: "CONFIGURATION", retryable: false };
  if (input.retryable) return { kind: "TRANSIENT", stage: input.stage, retryable: true };
  if (OWNERSHIP_REASONS.has(reason)) return { kind: "OWNERSHIP", stage: input.stage, retryable: false };
  if (APP_SUBSCRIPTION_REASONS.has(reason)) return { kind: "APP_SUBSCRIPTION", stage: "WEBHOOK_SUBSCRIPTION", retryable: false };
  return { kind: "META_REJECTED", stage: input.stage, retryable: false };
}

function messageFor(kind: VerificationFailureKind, stage: VerificationStage): string {
  switch (kind) {
    case "PROVIDER_DISABLED": return VERIFICATION_MESSAGES.PROVIDER_DISABLED;
    case "INTERNAL_UNAVAILABLE": return VERIFICATION_MESSAGES.INTERNAL_UNAVAILABLE;
    case "CONFIGURATION_MISSING": return VERIFICATION_MESSAGES.CONFIGURATION_MISSING;
    case "TRANSIENT": return VERIFICATION_MESSAGES.TRANSIENT;
    case "APP_SUBSCRIPTION": return VERIFICATION_MESSAGES.APP_SUBSCRIPTION;
    case "OWNERSHIP":
      return stage === "BUSINESS_PORTFOLIO" ? VERIFICATION_MESSAGES.BUSINESS_PORTFOLIO : VERIFICATION_MESSAGES.PHONE_OWNERSHIP;
    case "META_REJECTED": return VERIFICATION_MESSAGES.META_REJECTED;
  }
}

function httpStatusFor(kind: VerificationFailureKind): number {
  if (kind === "TRANSIENT") return 503;
  if (kind === "PROVIDER_DISABLED" || kind === "CONFIGURATION_MISSING") return 409;
  if (kind === "INTERNAL_UNAVAILABLE") return 503;
  return 422;
}

export function planVerificationFailure(
  input: VerificationFailureInput,
  checkedAt: Date,
): VerificationFailurePlan {
  const { kind, stage, retryable } = classify(input);
  const detail = input.detail?.trim() ? input.detail.trim().slice(0, 300) : null;
  const diagnostic: VerificationDiagnostic = { stage, reason: input.reason, detail, retryable };
  const record: VerificationRecord = {
    lastAttemptAt: checkedAt.toISOString(),
    ok: false,
    stage,
    reason: input.reason,
    detail,
    retryable,
  };

  /* Only a confirmed problem with this sender's setup changes its operational state. */
  const destructive = kind === "CONFIGURATION_MISSING" || kind === "OWNERSHIP" || kind === "APP_SUBSCRIPTION" || kind === "META_REJECTED";
  const senderPatch: SenderStatePatch | null = destructive
    ? {
        status: kind === "CONFIGURATION_MISSING" ? "NOT_CONFIGURED" : "NEEDS_ATTENTION",
        enabled: false,
        lastHealthCheckAt: checkedAt,
        lastError: [stage, input.reason, detail].filter(Boolean).join(" · ").slice(0, 500),
      }
    : null;

  return { kind, httpStatus: httpStatusFor(kind), error: messageFor(kind, stage), diagnostic, senderPatch, record };
}

function metadataObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {};
}

/**
 * An operator's deliberate disable. Set explicitly by the enable/disable toggle (`adminDisabled`),
 * and inferred for older rows: verification never writes `ACTIVE` together with `enabled: false`,
 * and never writes `DISABLED` at all, so either of those is an operator's choice.
 */
export function isAdminHeld(sender: SenderVerificationState): boolean {
  if (sender.status === "DISABLED") return true;
  const meta = metadataObject(sender.metadata);
  if (meta.adminDisabled === true) return true;
  if (meta.adminDisabled === false) return false;
  return sender.status === "ACTIVE" && !sender.enabled;
}

/**
 * Metadata to store after an attempt. Keeps every unrelated key, replaces the verification record,
 * and  before a confirmed failure overwrites the status  pins an inferred operator disable into
 * `adminDisabled` so the next successful check still honours it.
 */
export function mergeVerificationMetadata(
  sender: SenderVerificationState,
  record: VerificationRecord,
  willOverwriteStatus: boolean,
): Record<string, unknown> {
  const meta = metadataObject(sender.metadata);
  if (willOverwriteStatus && meta.adminDisabled === undefined && isAdminHeld(sender)) meta.adminDisabled = true;
  meta.verification = record;
  return meta;
}

export type VerificationSuccessPlan = {
  senderPatch: { status: string; enabled: boolean; lastError: null; lastHealthCheckAt: Date };
  adminHeld: boolean;
  message: string;
  warnings: string[];
};

/**
 * A successful check confirms the number, its WABA, the portfolio and the configured app's webhook
 * subscription  so the sender is ACTIVE and routable, unless an operator disabled it. Quality is a
 * separate signal: a RED rating is surfaced as a warning and never changes the outcome.
 */
export function planVerificationSuccess(
  sender: SenderVerificationState,
  checkedAt: Date,
  qualityRating: string | null,
): VerificationSuccessPlan {
  const adminHeld = isAdminHeld(sender);
  const warnings = qualityRating?.toUpperCase() === "RED" ? ["QUALITY_RATING_RED"] : [];
  return {
    senderPatch: {
      status: sender.status === "DISABLED" ? "DISABLED" : "ACTIVE",
      enabled: adminHeld ? sender.enabled : true,
      lastError: null,
      lastHealthCheckAt: checkedAt,
    },
    adminHeld,
    message: adminHeld ? VERIFICATION_MESSAGES.VERIFIED_ADMIN_HOLD : VERIFICATION_MESSAGES.VERIFIED,
    warnings,
  };
}

/** The JSON body for a failed verification: `error` stays the human message existing callers show. */
export function verificationErrorBody(error: string, diagnostic?: VerificationDiagnostic | null) {
  return diagnostic ? { error, ...diagnostic } : { error };
}
