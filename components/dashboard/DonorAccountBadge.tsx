"use client";

import type { DonorAccountStatus } from "@/lib/dashboard/donor-account";
import { dt } from "@/lib/dashboard/i18n";
import { cn } from "@/lib/utils";

export function DonorAccountBadge({ status }: { status?: DonorAccountStatus }) {
  const label = status === "MEMBER" ? dt("عضو مسجل") : status === "GUEST" ? dt("زائر") : dt("غير محدد");
  return <span title={label} className={cn("inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
    status === "MEMBER" ? "bg-sky-50 text-sky-800" : "bg-slate-100 text-slate-600")}>{label}</span>;
}
