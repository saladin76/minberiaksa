"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2, Radar, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dt } from "@/lib/dashboard/i18n";

type ActionName = "test" | "sync";

type FeedbackState = {
  tone: "success" | "error";
  message: string;
} | null;

type Props = {
  linkId: string;
};

export function ArchiveDriveLinkActions({ linkId }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState<ActionName | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  async function runAction(action: ActionName) {
    if (running) return;

    setRunning(action);
    setFeedback(null);

    const endpoint = action === "test"
      ? `/api/admin/archive/drive-links/${encodeURIComponent(linkId)}/test-access`
      : `/api/admin/archive/drive-links/${encodeURIComponent(linkId)}/sync`;

    try {
      const response = await fetch(endpoint, { method: "POST" });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        setFeedback({ tone: "error", message: cleanMessage(result?.message || result?.error || dt("تعذّر تنفيذ الإجراء")) });
        return;
      }

      setFeedback({ tone: "success", message: cleanMessage(result?.message || dt("تم التحديث")) });
      router.refresh();
    } catch {
      setFeedback({ tone: "error", message: dt("تعذّر تنفيذ الإجراء") });
    } finally {
      setRunning(null);
    }
  }

  const isTesting = running === "test";
  const isSyncing = running === "sync";

  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* The test endpoint only parses the Drive folder/file id; it does not call Google. */}
        <Button type="button" size="sm" variant="outline" disabled={Boolean(running)} onClick={() => runAction("test")} className="gap-2 font-bold" title={dt("يتحقق من صيغة الرابط ومعرّف المجلد فقط  لا يتصل بـ Google Drive")}>
          {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
          {dt("فحص صيغة الرابط")}</Button>
        {/* The sync endpoint is a no-op ("Sync skipped safely", externalCall: false). Disabled
            until a real Drive integration exists, so nobody believes files were refreshed. */}
        <Button type="button" size="sm" variant="outline" disabled className="gap-2 font-bold" title={dt("المزامنة مع Google Drive غير متصلة بعد")}>
          {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {dt("تحديث المواد")}</Button>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
          {dt("تجريبي  غير متصل بـ Google Drive")}</span>
      </div>

      {feedback ? (
        <div className={`mt-3 rounded-md border px-3 py-2 text-xs font-semibold ${feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          <div className="flex items-center gap-2">
            {feedback.tone === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function cleanMessage(message: string) {
  if (/external|provider|disabled|sync|runtime/i.test(message)) return dt("تم تسجيل الطلب. سيتم تحديث حالة الرابط بعد توفر المزامنة.");
  if (/failed/i.test(message)) return dt("تعذّر تنفيذ الإجراء");
  if (/updated/i.test(message)) return dt("تم التحديث");
  return message;
}
