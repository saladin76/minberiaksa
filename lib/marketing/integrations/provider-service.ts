import { integrationProviderCatalog } from "./provider-catalog";
import type { ProviderCatalogEntry, ProviderCategory, ProviderImplementationStatus } from "./provider-types";

export type ProviderCatalogOverview = {
  source: string;
  generatedAt: string;
  summary: {
    total: number;
    planned: number;
    partial: number;
    ready: number;
    categories: Record<ProviderCategory, number>;
  };
  providers: ProviderCatalogEntry[];
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

function countByStatus(providers: ProviderCatalogEntry[], status: ProviderImplementationStatus) {
  return providers.filter((provider) => provider.implementationStatus === status).length;
}

export function getProviderCatalogOverview(): ProviderCatalogOverview {
  const providers = integrationProviderCatalog;

  return {
    source: "shared-provider-catalog",
    generatedAt: new Date().toISOString(),
    summary: {
      total: providers.length,
      planned: countByStatus(providers, "PLANNED"),
      partial: countByStatus(providers, "PARTIAL"),
      ready: countByStatus(providers, "READY"),
      categories: categories.reduce(
        (acc, category) => ({
          ...acc,
          [category]: providers.filter((provider) => provider.category === category).length,
        }),
        {} as Record<ProviderCategory, number>,
      ),
    },
    providers,
  };
}
