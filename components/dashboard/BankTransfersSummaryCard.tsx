"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Landmark, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type Summary = {
  totals: Record<string, number>;
  approvedCount: number;
  pendingCount: number;
};

function money(value: number | undefined, currency: string) {
  return `${(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

export function BankTransfersSummaryCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/bank-transfers/summary")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch(() => { if (!cancelled) setSummary(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <Link href="/dashboard/bank-transfers" className="block h-full">
      <Card className="h-full border-border shadow-sm transition hover:border-brand/40 hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">التحويلات البنكية</p>
              {loading ? (
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل
                </div>
              ) : (
                <>
                  <p className="mt-2 text-xl font-bold text-slate-900">{money(summary?.totals?.TRY, "TRY")}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{money(summary?.totals?.USD, "USD")}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    معتمد: {summary?.approvedCount ?? 0} • تحتاج مراجعة: {summary?.pendingCount ?? 0}
                  </p>
                </>
              )}
            </div>
            <div className="rounded-xl bg-blue-50 p-2 text-brand">
              <Landmark className="h-5 w-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
