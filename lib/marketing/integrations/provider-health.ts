import { integrationProviderCatalog } from "./provider-catalog";
import type { ProviderCatalogEntry, ProviderCategory, ProviderKey } from "./provider-types";

export type ProviderHealthStatus = "READY" | "PARTIAL" | "MISSING" | "PLANNED";

export type ProviderHealthItem = {
  providerKey: ProviderKey;
  displayName: string;
  category: ProviderCategory;
  status: ProviderHealthStatus;
  score: number;
  readinessLayers: ProviderCatalogEntry["readinessLayers"];
  requiredFields: number;
  secretFields: number;
  publicFields: number;
  capabilityCount: number;
  nextStep: string;
};

export type ProviderHealthOverview = {
  source: string;
  generatedAt: string;
  summary: {
    total: number;
    ready: number;
    partial: number;
    missing: number;
    planned: number;
    averageScore: number;
  };
  items: ProviderHealthItem[];
};

function getHealthStatus(provider: ProviderCatalogEntry): ProviderHealthStatus {
  if (provider.implementationStatus === "READY") return "READY";
  if (provider.implementationStatus === "PARTIAL") return "PARTIAL";
  if (provider.credentialFields.length === 0) return "PLANNED";
  return "MISSING";
}

function getHealthScore(provider: ProviderCatalogEntry, status: ProviderHealthStatus) {
  if (status === "READY") return 100;
  if (status === "PARTIAL") return 65;
  if (status === "PLANNED") return 25;

  const hasOfficialDocs = provider.officialDocs.length > 0 ? 15 : 0;
  const hasCredentialContract = provider.credentialFields.length > 0 ? 20 : 0;
  const hasReadinessLayers = provider.readinessLayers.length > 0 ? 15 : 0;
  return hasOfficialDocs + hasCredentialContract + hasReadinessLayers;
}

function getNextStep(provider: ProviderCatalogEntry, status: ProviderHealthStatus) {
  if (status === "READY") return "الربط جاهز من ناحية الكاتالوج ويمكن استخدامه في واجهات التشغيل.";
  if (status === "PARTIAL") return "يوجد تنفيذ جزئي. راجع الحقول الناقصة وطبقات الجاهزية قبل التوسع.";
  if (status === "PLANNED") return "المزود مخطط له. ثبّت الوثائق الرسمية والحقول المطلوبة قبل التنفيذ.";
  if (provider.officialDocs.length === 0) return "أضف روابط التوثيق الرسمي قبل بناء أي تكامل.";
  return "أكمل Connection UI وHealth Checks قبل أي OAuth أو API فعلي.";
}

function toHealthItem(provider: ProviderCatalogEntry): ProviderHealthItem {
  const status = getHealthStatus(provider);
  const score = getHealthScore(provider, status);
  const requiredFields = provider.credentialFields.filter((field) => field.required).length;
  const secretFields = provider.credentialFields.filter((field) => field.secret).length;

  return {
    providerKey: provider.key,
    displayName: provider.displayName,
    category: provider.category,
    status,
    score,
    readinessLayers: provider.readinessLayers,
    requiredFields,
    secretFields,
    publicFields: provider.credentialFields.length - secretFields,
    capabilityCount: provider.capabilities.length,
    nextStep: getNextStep(provider, status),
  };
}

export function getProviderHealthOverview(): ProviderHealthOverview {
  const items = integrationProviderCatalog.map(toHealthItem);
  const totalScore = items.reduce((sum, item) => sum + item.score, 0);

  return {
    source: "provider-catalog-health-v1",
    generatedAt: new Date().toISOString(),
    summary: {
      total: items.length,
      ready: items.filter((item) => item.status === "READY").length,
      partial: items.filter((item) => item.status === "PARTIAL").length,
      missing: items.filter((item) => item.status === "MISSING").length,
      planned: items.filter((item) => item.status === "PLANNED").length,
      averageScore: items.length > 0 ? Math.round(totalScore / items.length) : 0,
    },
    items,
  };
}
