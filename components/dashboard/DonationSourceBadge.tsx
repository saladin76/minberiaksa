"use client";

import { cn } from "@/lib/utils";
import {
  detectDonationSource,
  PLATFORM_LABEL_AR,
  STATUS_LABEL_AR,
  type DonationSourceResult,
  type DetectSourceInput,
} from "@/lib/attribution/detect-source";
import { communicationCampaignRef } from "@/lib/attribution/communication-campaign";
import { useCommunicationCampaignName } from "@/lib/dashboard/use-communication-campaign-names";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { dt } from "@/lib/dashboard/i18n";

interface DonationSourceBadgeProps extends DetectSourceInput {
  /** Show only the tracking status when the surrounding column is already labeled. */
  compact?: boolean;
  className?: string;
}

/**
 * Two lines instead of one truncated pill:
 *   line 1 — the channel (Meta, Google Ads, واتساب …) is always fully visible;
 *   line 2 — the campaign, smaller, and the only part that truncates.
 * Internal WhatsApp / email / SMS campaigns (utm_medium=communication) show the
 * campaign's real name instead of its database id. Display only: detection,
 * attribution aggregates and conversion tracking are unchanged.
 */

const STATUS_DOT_CLASS: Record<DonationSourceResult["status"], string> = {
  verified: "bg-emerald-500",
  "utm-only": "bg-amber-400",
  "tracking-error": "bg-rose-500",
  organic: "bg-slate-300",
  unknown: "bg-slate-300",
};

const STATUS_PILL_CLASS: Record<DonationSourceResult["status"], string> = {
  verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "utm-only": "bg-amber-50 text-amber-700 border-amber-200",
  "tracking-error": "bg-rose-50 text-rose-700 border-rose-200",
  organic: "bg-slate-50 text-slate-600 border-slate-200",
  unknown: "bg-slate-50 text-slate-600 border-slate-200",
};

const COMMUNICATION_PILL_CLASS = "bg-sky-50 text-sky-800 border-sky-200";
const COMMUNICATION_DOT_CLASS = "bg-sky-500";

export function DonationSourceBadge({
  attribution,
  conversionEventsSentAt,
  conversionFailedEventsSentAt,
  status,
  compact = false,
  className,
}: DonationSourceBadgeProps) {
  const result = detectDonationSource({
    attribution,
    conversionEventsSentAt,
    conversionFailedEventsSentAt,
    status,
  });
  const communication = communicationCampaignRef(attribution);
  const communicationName = useCommunicationCampaignName(communication?.campaignId ?? null);

  const platformLabel = dt(PLATFORM_LABEL_AR[result.platform]);
  const statusLabel = result.sourceKind === "referral" ? dt("إحالة خارجية (غير مؤكدة كإعلان)") : dt(STATUS_LABEL_AR[result.status]);
  // utm_campaign is the name a marketer typed in Ads Manager; campaign_id is the
  // numeric fallback for links that carried the id but lost the utm params.
  const adCampaignLabel = result.campaignName ?? (result.campaignId ? `#${result.campaignId}` : null);
  // Organic rows have no campaign at all, so they keep falling back to "غير إعلاني".
  const adSourceLabel = result.platform === "organic" || result.platform === "unknown" ? result.sourceLabel : platformLabel;

  const channelLabel = communication ? dt(communication.channelLabel) : adSourceLabel;
  const campaignLabel = communication
    ? communicationName ?? (communicationName === undefined ? "…" : dt("حملة داخلية"))
    : adCampaignLabel;
  const pillClass = communication ? COMMUNICATION_PILL_CLASS : STATUS_PILL_CLASS[result.status];
  const dotClass = communication ? COMMUNICATION_DOT_CLASS : STATUS_DOT_CLASS[result.status];

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex min-w-[86px] max-w-[220px] flex-col items-start gap-0.5 rounded-lg border px-2 py-1 text-start leading-tight",
              pillClass,
              className
            )}
          >
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-semibold">
              <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", dotClass)} aria-hidden />
              {compact ? statusLabel : channelLabel}
            </span>
            {!compact && campaignLabel ? (
              <bdi className="block max-w-[200px] truncate text-[11px] font-normal opacity-75">{campaignLabel}</bdi>
            ) : null}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs bg-white text-slate-800 border border-slate-200 shadow-md p-3 space-y-1.5 text-start"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold break-words">{[channelLabel, campaignLabel].filter(Boolean).join(" · ")}</span>
            <span className="text-[10px] text-slate-500 shrink-0">{communication ? dt("حملة داخلية") : statusLabel}</span>
          </div>
          {communication ? (
            <>
              <div className="text-[11px] text-slate-600">
                <span className="text-slate-400">{dt("القناة: ")}</span>
                {dt(communication.channelLabel)}
              </div>
              <div className="break-words text-[11px] text-slate-600">
                <span className="text-slate-400">{dt("الحملة: ")}</span>
                <bdi>{communicationName ?? communication.campaignId ?? "—"}</bdi>
              </div>
            </>
          ) : (
            <div className="text-[11px] text-slate-600">
              <span className="text-slate-400">{dt("المنصة: ")}</span>
              {platformLabel}
            </div>
          )}
          {result.placement ? (
            <div className="text-[11px] text-slate-600">
              <span className="text-slate-400">{dt("الموضع: ")}</span>
              {result.placement}
            </div>
          ) : null}
          {communication ? null : (
            <div className="text-[11px] text-slate-600">
              <span className="text-slate-400">{dt("اكتمال بيانات التتبع: ")}</span>
              {result.confidence}%
            </div>
          )}
          {result.sourceDetails.filter(detail => !["first_landing_page", "first_referrer"].includes(detail.key)).map(detail => <div key={detail.key} className="break-words text-[11px] text-slate-600"><bdi className="text-slate-400">{detail.key}</bdi>: <bdi>{detail.key === "attribution_origin" && detail.value === "subscription_signup" ? dt("مصدر الاشتراك الأصلي") : detail.value}</bdi></div>)}
          {!communication && result.reasons.length > 0 ? (
            <ul className="text-[10.5px] text-slate-500 space-y-0.5 mt-1 border-t border-slate-100 pt-1.5">
              {result.reasons.map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
