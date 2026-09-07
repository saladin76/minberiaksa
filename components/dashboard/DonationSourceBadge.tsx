"use client";

import { cn } from "@/lib/utils";
import {
  detectDonationSource,
  PLATFORM_LABEL_AR,
  STATUS_LABEL_AR,
  type DonationSourceResult,
  type DetectSourceInput,
} from "@/lib/attribution/detect-source";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DonationSourceBadgeProps extends DetectSourceInput {
  /** Show only the tracking status when the surrounding column is already labeled. */
  compact?: boolean;
  className?: string;
}

/**
 * The pill shows the ad campaign name (الحملة الإعلانية / `utm_campaign`) —
 * that's what the team recognises when scanning the table; the platform
 * ("Meta", "Google Ads", …) is one hover away in the tooltip.
 *
 * Campaign names are long and free-form ("Retargeting | Value"), so the pill is
 * width-capped and its label truncates instead of shoving the neighbouring
 * column out of alignment. The full name stays in the tooltip below and in the
 * attribution details dialog, so nothing is lost.
 */

const STATUS_DOT_CLASS: Record<DonationSourceResult["status"], string> = {
  verified: "bg-emerald-500",
  "utm-only": "bg-amber-400",
  "tracking-error": "bg-rose-500",
  organic: "bg-slate-300",
};

const STATUS_PILL_CLASS: Record<DonationSourceResult["status"], string> = {
  verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "utm-only": "bg-amber-50 text-amber-700 border-amber-200",
  "tracking-error": "bg-rose-50 text-rose-700 border-rose-200",
  organic: "bg-slate-50 text-slate-600 border-slate-200",
};

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

  const platformLabel = PLATFORM_LABEL_AR[result.platform];
  const statusLabel = STATUS_LABEL_AR[result.status];
  // utm_campaign is the name a marketer typed in Ads Manager; campaign_id is the
  // numeric fallback for links that carried the id but lost the utm params.
  const campaignLabel =
    result.campaignName ?? (result.campaignId ? `#${result.campaignId}` : null);
  // Organic rows have no campaign at all, so they keep falling back to "غير إعلاني".
  const pillLabel = compact ? statusLabel : campaignLabel ?? platformLabel;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium leading-none min-w-[86px] max-w-[180px]",
              STATUS_PILL_CLASS[result.status],
              className
            )}
          >
            <span
              className={cn("inline-block shrink-0 w-1.5 h-1.5 rounded-full", STATUS_DOT_CLASS[result.status])}
              aria-hidden
            />
            <span className="truncate">{pillLabel}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs bg-white text-slate-800 border border-slate-200 shadow-md p-3 space-y-1.5 text-right"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold break-words">{campaignLabel ?? platformLabel}</span>
            <span className="text-[10px] text-slate-500 shrink-0">{statusLabel}</span>
          </div>
          <div className="text-[11px] text-slate-600">
            <span className="text-slate-400">المنصة: </span>
            {platformLabel}
          </div>
          {result.placement ? (
            <div className="text-[11px] text-slate-600">
              <span className="text-slate-400">الموضع: </span>
              {result.placement}
            </div>
          ) : null}
          <div className="text-[11px] text-slate-600">
            <span className="text-slate-400">الثقة: </span>
            {result.confidence}%
          </div>
          {result.reasons.length > 0 ? (
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
