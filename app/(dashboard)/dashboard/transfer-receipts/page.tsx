"use client";

import { Suspense } from "react";
import { Receipt } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { TransferReceiptsView } from "./_components/TransferReceiptsView";

/**
 * إيصالات التحويل — the finance desk's queue for bank-transfer donations.
 *
 * A donor who picks "تحويل بنكي" at checkout transfers outside the site and
 * uploads the receipt; the order sits as "قيد التأكيد" — visible, counted
 * nowhere — until someone here matches it against the bank account and
 * confirms it (`DONATION_LOGIC_SPEC §3`). Confirming settles the donation the
 * way a gateway webhook would: it lands in revenue, in the campaign totals, in
 * the donor's profile, and the official receipt goes out.
 *
 * Separate from `/dashboard/bank-transfers`, which imports the bank's own
 * statement: that queue starts from the bank's file, this one from the
 * donor's photo. Both are finance, so both sit behind the same permission.
 */
export default function TransferReceiptsPage() {
  return (
    <div className="min-h-0" dir="rtl">
      <div className="mx-auto max-w-[1600px]">
        <PageHeader
          eyebrow="المالية"
          title="إيصالات التحويل"
          description="إيصالات رفعها المتبرعون بعد اختيار «التحويل البنكي» عند الدفع. طابق كل إيصال مع كشف الحساب ثم أكّده ليُحتسب التبرع، أو ارفضه مع ذكر السبب ليتمكن المتبرع من رفع إيصال آخر."
          icon={Receipt}
        />
        {/* `useSearchParams` in the view needs a boundary for static rendering. */}
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white" />}>
          <TransferReceiptsView />
        </Suspense>
      </div>
    </div>
  );
}
