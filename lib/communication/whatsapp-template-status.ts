export type TemplateInternalStatus =
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED"
  | "IN_APPEAL"
  | "MISSING_IN_WABA"
  | "UNKNOWN";

export type TemplateStatusView = {
  providerStatus: string;
  internalStatus: TemplateInternalStatus;
  labelAr: string;
};

export function normalizeMetaTemplateStatus(status: string | null | undefined): string {
  const value = String(status ?? "").trim().toUpperCase();
  return value || "UNKNOWN";
}

export function mapMetaTemplateStatus(status: string | null | undefined): TemplateStatusView {
  const providerStatus = normalizeMetaTemplateStatus(status);
  switch (providerStatus) {
    case "PENDING":
    case "IN_REVIEW":
      return { providerStatus, internalStatus: "IN_REVIEW", labelAr: "قيد المراجعة" };
    case "APPROVED":
      return { providerStatus, internalStatus: "APPROVED", labelAr: "معتمد" };
    case "REJECTED":
      return { providerStatus, internalStatus: "REJECTED", labelAr: "مرفوض" };
    case "PAUSED":
      return { providerStatus, internalStatus: "PAUSED", labelAr: "موقوف مؤقتًا" };
    case "DISABLED":
      return { providerStatus, internalStatus: "DISABLED", labelAr: "معطّل" };
    case "IN_APPEAL":
      return { providerStatus, internalStatus: "IN_APPEAL", labelAr: "قيد الاستئناف" };
    case "MISSING_IN_WABA":
      return { providerStatus, internalStatus: "MISSING_IN_WABA", labelAr: "غير متاح في كل الحسابات" };
    default:
      return { providerStatus, internalStatus: "UNKNOWN", labelAr: "غير معروف" };
  }
}

function statusRank(status: string | null | undefined): number {
  switch (mapMetaTemplateStatus(status).internalStatus) {
    case "REJECTED":
    case "DISABLED":
      return 70;
    case "PAUSED":
      return 60;
    case "IN_APPEAL":
      return 50;
    case "IN_REVIEW":
      return 40;
    case "MISSING_IN_WABA":
      return 30;
    case "UNKNOWN":
      return 20;
    case "APPROVED":
      return 10;
  }
}

export function deriveOverallMetaTemplateStatus(statuses: Array<string | null | undefined>): TemplateStatusView {
  const usable = statuses.filter((status) => String(status ?? "").trim().length > 0);
  if (!usable.length) return mapMetaTemplateStatus("UNKNOWN");
  const worst = usable.reduce((current, candidate) =>
    statusRank(candidate) > statusRank(current) ? candidate : current
  );
  return mapMetaTemplateStatus(worst);
}
