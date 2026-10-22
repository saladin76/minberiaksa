import { schemaHasInvalidMetaParameterNames } from "./meta-parameter-name";
import { normalizeMetaTemplateStatus } from "./whatsapp-template-status";

export type VariantReadiness = {
  ready: boolean;
  reason: string | null;
  languageCode: string | null;
  approvalStatus: string | null;
  category: string | null;
  locale: string | null;
  providerTemplateName: string | null;
  componentsSchema: unknown;
  rejectionReason: string | null;
  lastSyncedAt: Date | null;
};

export const NOT_READY: VariantReadiness = {
  ready: false,
  reason: "NO_VARIANT",
  languageCode: null,
  approvalStatus: null,
  category: null,
  locale: null,
  providerTemplateName: null,
  componentsSchema: null,
  rejectionReason: null,
  lastSyncedAt: null,
};

export type VariantRow = {
  languageCode: string;
  locale: string | null;
  approvalStatus: string;
  category: string | null;
  providerTemplateName: string;
  componentsSchema: unknown;
  rejectionReason: string | null;
  lastSyncedAt: Date;
};

export function resolveVariantForLocale(variants: VariantRow[], locale: string, fallbackLocale = "ar"): VariantReadiness {
  if (!variants.length) return NOT_READY;
  const approved = variants.filter((v) => v.approvalStatus === "APPROVED");
  const pool = approved.length ? approved : variants;
  const base = String(locale ?? "").toLowerCase().replace(/[_-].*$/, "");
  const chosen =
    pool.find((v) => v.locale === locale) ??
    pool.find((v) => v.languageCode.toLowerCase() === locale.toLowerCase()) ??
    pool.find((v) => v.languageCode.toLowerCase().replace(/[_-].*$/, "") === base) ??
    pool.find((v) => v.locale === fallbackLocale) ??
    pool.find((v) => v.languageCode.toLowerCase() === fallbackLocale.toLowerCase()) ??
    pool.find((v) => v.languageCode.toLowerCase().replace(/[_-].*$/, "") === fallbackLocale.toLowerCase()) ??
    pool.find((v) => v.locale === "ar") ??
    pool.find((v) => v.languageCode.toLowerCase().startsWith("ar")) ??
    null;
  if (!chosen) return NOT_READY;
  const isApproved = normalizeMetaTemplateStatus(chosen.approvalStatus) === "APPROVED";
  const parameterSchemaInvalid = isApproved && schemaHasInvalidMetaParameterNames(chosen.componentsSchema);
  const ready = isApproved && !parameterSchemaInvalid;
  return {
    ready,
    reason: parameterSchemaInvalid ? "META_TEMPLATE_PARAMETER_NAME_INVALID" : ready ? null : "NOT_APPROVED",
    languageCode: chosen.languageCode,
    approvalStatus: chosen.approvalStatus,
    category: chosen.category ?? null,
    locale: chosen.locale,
    providerTemplateName: chosen.providerTemplateName,
    componentsSchema: chosen.componentsSchema,
    rejectionReason: chosen.rejectionReason,
    lastSyncedAt: chosen.lastSyncedAt,
  };
}
