"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileText, ImageOff, Landmark, Paperclip, RotateCcw, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminClaimView } from "@/lib/donations/bank-transfer-serializers";
import { CLAIM_STATUS_DOT, CLAIM_STATUS_LABELS, CLAIM_STATUS_PILL, money, relativeTime, usd, waitingDays } from "./status";

/**
 * One claim in the queue. Reads in the order a reviewer needs it: who, how
 * much, what for, then the evidence — with the receipt thumbnail large enough
 * to tell a bank screenshot from a blurry photo before opening anything.
 */
export function TransferReceiptCard({ claim, onOpen }: { claim: AdminClaimView; onOpen: () => void }) {
  const latest = claim.receipts[claim.receipts.length - 1] ?? null;
  const initial = (claim.donor.name ?? claim.donor.email ?? "?").trim().charAt(0).toUpperCase();
  const waitedSince = claim.status === "UNDER_REVIEW" ? claim.receiptSubmittedAt ?? claim.createdAt : claim.createdAt;
  const days = waitingDays(waitedSince);
  const urgent = claim.status === "UNDER_REVIEW" && days >= 2;
  const lines = claim.donation.lines.map((l) => l.title);

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md",
        claim.status === "UNDER_REVIEW" ? "border-amber-200" : "border-slate-200",
      )}
    >
      {/* The evidence first — a receipt is a picture before it is a record. */}
      <button type="button" onClick={onOpen} className="relative block h-40 w-full overflow-hidden bg-slate-100 text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        {latest ? (
          latest.isImage ? (
            <img src={latest.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-rose-50 to-slate-50 text-rose-600">
              <FileText className="h-10 w-10" />
              <span className="max-w-[80%] truncate text-xs font-medium text-slate-600" dir="ltr">{latest.fileName}</span>
            </div>
          )
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
            <ImageOff className="h-8 w-8" />
            <span className="text-xs">لم يُرفع إيصال بعد</span>
          </div>
        )}

        <span className={cn("absolute top-2 start-2 inline-flex items-center gap-1.5 rounded-full border bg-white/95 px-2 py-0.5 text-[11px] font-semibold backdrop-blur", CLAIM_STATUS_PILL[claim.status])}>
          <span className={cn("h-1.5 w-1.5 rounded-full", CLAIM_STATUS_DOT[claim.status])} />
          {CLAIM_STATUS_LABELS[claim.status]}
        </span>

        {claim.receipts.length > 1 && (
          <span className="absolute top-2 end-2 inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2 py-0.5 text-[11px] font-semibold text-white">
            <Paperclip className="h-3 w-3" />
            {claim.receipts.length}
          </span>
        )}
        {claim.submissionCount > 1 && (
          <span className="absolute bottom-2 end-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-slate-700" title="أُعيد رفع الإيصال بعد رفض">
            <RotateCcw className="h-3 w-3" />
            المحاولة {claim.submissionCount}
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 shrink-0 rounded-full ring-2 ring-white shadow-sm">
            <AvatarImage src={claim.donor.image ?? undefined} alt="" />
            <AvatarFallback className="rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-semibold text-white">{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold text-slate-900">{claim.donor.name || "متبرع بلا اسم"}</p>
            <p className="truncate text-[12px] text-slate-500" dir="ltr">{claim.donor.email ?? claim.donor.phone ?? "—"}</p>
          </div>
          <div className="text-end">
            <p className="text-[16px] font-bold tabular-nums text-slate-900" dir="ltr">{money(claim.donation.totalAmount, claim.donation.currency)}</p>
            {claim.donation.currency !== "USD" && usd(claim.donation.amountUSD) && (
              <p className="text-[11px] tabular-nums text-slate-400" dir="ltr">{usd(claim.donation.amountUSD)}</p>
            )}
          </div>
        </div>

        {lines.length > 0 && (
          <p className="line-clamp-2 text-[12.5px] leading-5 text-slate-600" title={lines.join("، ")}>
            {lines.join("، ")}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
          {claim.bankName && (
            <span className="inline-flex items-center gap-1">
              <Landmark className="h-3 w-3" />
              {claim.bankName}
              {claim.bankCurrency && <span className="text-slate-400" dir="ltr">· {claim.bankCurrency}</span>}
            </span>
          )}
          <span className={cn("inline-flex items-center gap-1", urgent && "font-semibold text-amber-700")} title={new Date(waitedSince).toLocaleString("ar-EG")}>
            {urgent ? <AlertTriangle className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
            {claim.status === "UNDER_REVIEW" ? `رُفع ${relativeTime(waitedSince)}` : `أُنشئ ${relativeTime(waitedSince)}`}
          </span>
        </div>

        <Button size="sm" variant={claim.status === "UNDER_REVIEW" ? "default" : "outline"} className="w-full" onClick={onOpen}>
          {claim.status === "UNDER_REVIEW" ? "مراجعة الإيصال" : "عرض التفاصيل"}
        </Button>
      </div>
    </article>
  );
}
