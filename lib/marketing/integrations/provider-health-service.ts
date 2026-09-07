import { integrationProviderCatalog } from "./provider-catalog";
import type { ProviderCatalogEntry, ProviderCategory, ProviderKey } from "./provider-types";

export type ProviderHealthStatus = "READY" | "PARTIAL" | "MISSING" | "NOT_CONNECTED";

export type ProviderConnectionHealthInput = {
  platform: string;
  enabled: boolean;
  status: string;
  readiness?: {
    completionPercent?: number;
    missingRequiredFields?: string[];
    missingOptionalFields?: string[];
    nextStepMessage?: string;
    status?: string;
  } | null;
  lastSyncAt?: string | null;
  lastTestAt?: string | null;
  lastError?: string | null;
};

export type ProviderHealthItem = {
  provider: ProviderCatalogEntry;
  status: ProviderHealthStatus;
  connectionCount: number;
  readyConnections: number;
  partialConnections: number;
  disabledConnections: number;
  bestCompletionPercent: number;
  missingRequiredFields: string[];
  lastSyncAt: string | null;
  lastTestAt: string | null;
  lastError: string | null;
  nextStep: string;
};

export type ProviderHealthOverview = {
  source: string;
  generatedAt: string;
  summary: {
    totalProviders: number;
    ready: number;
    partial: number;
    missing: number;
    notConnected: number;
    categories: Record<ProviderCategory, number>;
  };
  providers: ProviderHealthItem[];
};

const categories: ProviderCategory[] = [
  "PIXELS_AND_APIS",
  "AD_ACCOUNT",
  "ANALYTICS_ACCOUNT",
  "MESSAGING_PROVIDER",
  "EMAIL_PROVIDER",
  "AI_PROVIDER",
  "INTERNAL_API",
];

const platformAlias: Partial<Record<ProviderKey, string[]>> = {
  meta: ["META", "FACEBOOK"],
  google_ads: ["GOOGLE_ADS"],
  ga4: ["GA4", "GOOGLE_ANALYTICS"],
  tiktok: ["TIKTOK"],
  x_ads: ["X", "X_ADS", "TWITTER"],
  twilio: ["TWILIO"],
  netgsm: ["NETGSM"],
  openai: ["OPENAI"],
  email: ["EMAIL"],
  whatsapp: ["WHATSAPP"],
  internal_webhooks: ["INTERNAL_WEBHOOKS", "INTERNAL"],
};

function aliasesFor(providerKey: ProviderKey) {
  return new Set([providerKey.toUpperCase(), ...(platformAlias[providerKey] ?? [])]);
}

function maxDate(values: Array<string | null | undefined>) {
  return values.reduce<string | null>((latest, value) => {
    if (!value) return latest;
    if (!latest || value > latest) return value;
    return latest;
  }, null);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildProviderHealthOverview(
  connections: ProviderConnectionHealthInput[],
): ProviderHealthOverview {
  const providers = integrationProviderCatalog.map((provider): ProviderHealthItem => {
    const aliases = aliasesFor(provider.key);
    const related = connections.filter((connection) => aliases.has(connection.platform.toUpperCase()));
    const enabled = related.filter((connection) => connection.enabled);
    const readyConnections = enabled.filter(
      (connection) => (connection.readiness?.completionPercent ?? 0) >= 100 && connection.status !== "DISABLED",
    ).length;
    const partialConnections = enabled.filter(
      (connection) =>
        (connection.readiness?.completionPercent ?? 0) > 0 &&
        (connection.readiness?.completionPercent ?? 0) < 100,
    ).length;
    const disabledConnections = related.filter((connection) => !connection.enabled).length;
    const bestCompletionPercent = Math.max(
      0,
      ...related.map((connection) => connection.readiness?.completionPercent ?? 0),
    );
    const missingRequiredFields = unique(
      related.flatMap((connection) => connection.readiness?.missingRequiredFields ?? []),
    );
    const lastError = related.find((connection) => connection.lastError)?.lastError ?? null;

    let status: ProviderHealthStatus = "NOT_CONNECTED";
    if (readyConnections > 0) status = "READY";
    else if (partialConnections > 0 || disabledConnections > 0 || bestCompletionPercent > 0) status = "PARTIAL";
    else if (related.length > 0) status = "MISSING";

    return {
      provider,
      status,
      connectionCount: related.length,
      readyConnections,
      partialConnections,
      disabledConnections,
      bestCompletionPercent,
      missingRequiredFields,
      lastSyncAt: maxDate(related.map((connection) => connection.lastSyncAt)),
      lastTestAt: maxDate(related.map((connection) => connection.lastTestAt)),
      lastError,
      nextStep:
        related.find((connection) => connection.readiness?.nextStepMessage)?.readiness?.nextStepMessage ??
        (status === "NOT_CONNECTED"
          ? "أضف اتصالًا لهذه المنصة قبل تشغيل المزامنة أو الأحداث."
          : status === "READY"
            ? "الاتصال جاهز مبدئيًا. راقب آخر اختبار وآخر مزامنة."
            : "راجع الحقول المطلوبة وحالة الاتصال قبل الاعتماد عليه."),
    };
  });

  return {
    source: "provider-catalog-with-connection-health",
    generatedAt: new Date().toISOString(),
    summary: {
      totalProviders: providers.length,
      ready: providers.filter((item) => item.status === "READY").length,
      partial: providers.filter((item) => item.status === "PARTIAL").length,
      missing: providers.filter((item) => item.status === "MISSING").length,
      notConnected: providers.filter((item) => item.status === "NOT_CONNECTED").length,
      categories: categories.reduce(
        (acc, category) => ({
          ...acc,
          [category]: providers.filter((item) => item.provider.category === category).length,
        }),
        {} as Record<ProviderCategory, number>,
      ),
    },
    providers,
  };
}
