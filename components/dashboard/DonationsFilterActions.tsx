"use client";

import Link from "next/link";
import { Download, Plus, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The three actions that sit next to every «تصفية النتائج» header.
 *
 * They deliberately share ONE neutral style: green/amber/blue pills read as
 * three different *kinds* of action (success / warning / info) when this is
 * just a toolbar, and the colour noise competed with the status pills in the
 * table below. Hierarchy comes from the order, not from the palette.
 */

const ACTION_CLASS =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

const ICON_CLASS = "w-4 h-4 text-slate-400";

interface DonationsFilterActionsProps {
  canEditDonations: boolean;
  canExportReports: boolean;
  onCreateDonation: () => void;
  onExportReport: () => void;
  className?: string;
}

export function DonationsFilterActions({
  canEditDonations,
  canExportReports,
  onCreateDonation,
  onExportReport,
  className,
}: DonationsFilterActionsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 shrink-0", className)}>
      {canEditDonations && (
        <button type="button" onClick={onCreateDonation} className={ACTION_CLASS}>
          <Plus className={ICON_CLASS} />
          تبرع جديد
        </button>
      )}
      {canEditDonations && (
        <Link href="/dashboard/users/donors/bulk-import" className={ACTION_CLASS}>
          <UploadCloud className={ICON_CLASS} />
          استيراد التبرعات
        </Link>
      )}
      {canExportReports && (
        <button type="button" onClick={onExportReport} className={ACTION_CLASS}>
          <Download className={ICON_CLASS} />
          تصدير التقرير
        </button>
      )}
    </div>
  );
}
