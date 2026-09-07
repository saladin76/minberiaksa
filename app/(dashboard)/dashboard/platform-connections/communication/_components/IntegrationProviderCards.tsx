"use client";

import { Clock3, Mail, MessageCircle, MessageSquare } from "lucide-react";
import type { IntegrationProvider } from "@/lib/integration-settings/catalog";
import { PROVIDER_UI_LABEL, PROVIDER_USAGE, uiStatus } from "@/lib/integration-settings/ui";
import { cn } from "@/lib/utils";
import { CompletionMeter, StatusChip } from "./panel-ui";
import type { IntegrationUiSnapshot } from "./model";

const icons = {
  META_WHATSAPP: MessageCircle,
  ELASTIC_EMAIL: Mail,
  BREVO: MessageSquare,
  NETGSM: MessageSquare,
  SYSTEM: Clock3,
} satisfies Record<IntegrationProvider, typeof MessageCircle>;

function formatCheck(value: string | null) {
  return value ? new Date(value).toLocaleString("ar") : "لم يتم";
}

/**
 * The provider strip is a selector, so each card IS the control — previously the
 * card was inert and carried a separate «فتح الإعدادات» button, which meant the
 * obvious click target did nothing and the selected card was signalled only by a
 * ring. As a real `button` with `aria-pressed` it is keyboard-reachable and
 * announces its own state.
 *
 * Cards stretch to equal height from the grid rather than a hard `min-h-[230px]`,
 * so a longer provider description no longer either overflows or leaves the
 * others with dead space.
 */
export function IntegrationProviderCards({ providers, active, onOpen }: {
  providers: IntegrationUiSnapshot[];
  active: IntegrationProvider;
  onOpen: (provider: IntegrationProvider) => void;
}) {
  return (
    // Five providers: `xl:grid-cols-4` left a lone fifth card stranded on its own
    // row, and nothing between sm and xl meant they sat two-up and very wide
    // across the whole tablet/laptop range.
    <section className="grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="حالة مزودي التواصل">
      {providers.map((snapshot) => {
        const provider = snapshot.provider;
        const Icon = icons[provider];
        const status = uiStatus(snapshot);
        const infrastructureOnly = provider === "SYSTEM";
        const completed = infrastructureOnly
          ? (snapshot.activeTest.lastTestResult === "SUCCESS" ? 1 : 0)
          : snapshot.fields.filter((field) => field.configured).length;
        const total = infrastructureOnly ? 1 : snapshot.fields.length;
        const isActive = active === provider;

        return (
          <button
            key={provider}
            type="button"
            onClick={() => onOpen(provider)}
            aria-pressed={isActive}
            className={cn(
              "flex h-full flex-col rounded-xl border bg-white p-4 text-right shadow-sm transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
              isActive
                ? "border-brand ring-1 ring-brand/25"
                : "border-slate-200 hover:border-slate-300 hover:shadow"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                  isActive ? "bg-brand text-white" : "bg-slate-100 text-slate-500"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <StatusChip status={status} />
            </div>

            <h2 className="mt-3 text-sm font-semibold text-slate-900">{PROVIDER_UI_LABEL[provider]}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{PROVIDER_USAGE[provider]}</p>

            <div className="mt-4 space-y-3">
              <CompletionMeter completed={completed} total={total} />
              <p className="text-[11px] text-slate-400">
                آخر فحص: <span className="text-slate-500">{formatCheck(snapshot.activeTest.lastTestAt)}</span>
              </p>
            </div>

            {/* Pinned to the bottom so cards with and without pending changes still
                line up along the grid's shared baseline. */}
            <div className="mt-auto pt-3">
              {snapshot.candidate.hasChanges ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
                  تغييرات بانتظار الاعتماد
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </section>
  );
}
