"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Megaphone, X } from "lucide-react";

/**
 * Campaign scoping for the three channel pages.
 *
 * Opening a campaign from الحملات التسويقية lands here with `?campaign=<id>`, and the whole page —
 * summary, chart, delivery list — narrows to that campaign's sends. This is where a campaign's
 * performance is read: rather than building a fourth analytics surface inside the campaign screen,
 * the channel page it already belongs to does the job, so the funnel a campaign is judged by is the
 * same one used for everything else on that channel.
 *
 * The banner is not decoration. A scoped page and an unscoped page otherwise look identical, and a
 * dashboard silently showing a subset of reality is worse than one showing none of it — so the
 * scope is stated, named, and has a visible way out.
 */
export function useCampaignScope() {
  const params = useSearchParams();
  const campaignId = params.get("campaign")?.trim() || "";
  const [name, setName] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!campaignId) {
      setName(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/communication/campaigns/${campaignId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.ok) setName(j.campaign?.name ?? null);
      })
      .catch(() => {
        /* The banner falls back to the id — a failed name lookup must not hide the scope. */
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  return { campaignId, campaignName: name };
}

export function CampaignScopeBanner({
  campaignId,
  campaignName,
  clearHref,
}: {
  campaignId: string;
  campaignName: string | null;
  clearHref: string;
}) {
  if (!campaignId) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5">
      <Megaphone className="h-4 w-4 shrink-0 text-brand" />
      <p className="min-w-0 flex-1 text-[13px] text-brand-900">
        هذه الصفحة مُصفّاة على حملة{" "}
        <b className="font-semibold">{campaignName ?? campaignId}</b> — الأرقام والرسوم والقائمة
        أدناه تخصّ هذه الحملة وحدها، بلا حدّ زمني.
      </p>
      <Link
        href={clearHref}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-brand-200 bg-white px-2 py-1 text-[11px] font-medium text-brand-700 transition-colors hover:bg-brand-100"
      >
        <X className="h-3 w-3" />
        عرض كل الرسائل
      </Link>
    </div>
  );
}
