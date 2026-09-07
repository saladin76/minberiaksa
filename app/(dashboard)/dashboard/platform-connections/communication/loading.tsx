import { INTEGRATION_PROVIDERS } from "@/lib/integration-settings/catalog";

/**
 * Mirrors the real layout: one card per provider (the count was hard-coded to 4
 * against a catalogue of 5, so a card appeared out of nowhere on hydration) and
 * the same grid steps as `IntegrationProviderCards`.
 */
export default function CommunicationConnectionsLoading() {
  return (
    <main className="space-y-4 p-4 sm:p-6" dir="rtl" aria-busy="true" aria-label="جاري تحميل إعدادات مزودي التواصل">
      <div className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {INTEGRATION_PROVIDERS.map((provider) => (
          <div key={provider} className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
      {/* Panel height tracks the field count, so a fixed h-[520px] guaranteed a
          jump on hydration; a min-height that the shortest provider still fills
          keeps the shift in one direction and small. */}
      <div className="min-h-80 animate-pulse rounded-xl border border-slate-200 bg-white" />
    </main>
  );
}
