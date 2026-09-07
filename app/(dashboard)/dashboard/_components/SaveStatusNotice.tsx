"use client";

import { AlertCircle, CheckCircle2, Loader2, Clock3 } from "lucide-react";

export type SaveStatusType = "idle" | "saving" | "success" | "error" | "info";
export type SaveStatusState = {
  type: SaveStatusType;
  message: string;
  detail?: string;
};

const toneByType: Record<SaveStatusType, string> = {
  idle: "border-slate-200 bg-slate-50 text-slate-600",
  saving: "border-blue-200 bg-blue-50 text-blue-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-amber-200 bg-amber-50 text-amber-800",
};

function StatusIcon({ type }: { type: SaveStatusType }) {
  if (type === "saving") return <Loader2 className="h-4 w-4 animate-spin" />;
  if (type === "success") return <CheckCircle2 className="h-4 w-4" />;
  if (type === "error") return <AlertCircle className="h-4 w-4" />;
  return <Clock3 className="h-4 w-4" />;
}

export function SaveStatusNotice({ status }: { status?: SaveStatusState | null }) {
  if (!status || status.type === "idle" || !status.message) return null;

  return (
    <div
      className={`mt-3 inline-flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm ${toneByType[status.type]}`}
      role={status.type === "error" ? "alert" : "status"}
    >
      <StatusIcon type={status.type} />
      <span className="truncate">{status.message}</span>
      {status.detail && <span className="hidden text-xs font-normal opacity-80 sm:inline">{status.detail}</span>}
    </div>
  );
}
