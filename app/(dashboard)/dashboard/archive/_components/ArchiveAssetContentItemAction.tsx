"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";

type FeedbackState = {
  tone: "success" | "error";
  message: string;
} | null;

type Props = {
  assetId: string;
  fileName: string;
  disabled?: boolean;
  disabledReason?: string | null;
};

export function ArchiveAssetContentItemAction({ assetId, fileName, disabled = false, disabledReason }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  async function createContentItem() {
    if (disabled || saving) return;
    const confirmed = window.confirm(`إنشاء عنصر محتوى من هذه المادة: ${fileName}؟`);
    if (!confirmed) return;

    setSaving(true);
    setFeedback(null);

    const response = await fetch(`/api/admin/archive/assets/${encodeURIComponent(assetId)}/create-content-item`, {
      method: "POST",
    });
    const result = await response.json().catch(() => null);
    setSaving(false);

    if (!response.ok || !result?.ok) {
      setFeedback({ tone: "error", message: result?.error || result?.message || "تعذر إنشاء عنصر المحتوى" });
      return;
    }

    setFeedback({ tone: "success", message: result?.message || "تم إنشاء عنصر محتوى من المادة" });
    router.refresh();
  }

  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled || saving} onClick={createContentItem} className="gap-2 font-bold">
          <Layers3 className="h-4 w-4" /> {saving ? "جاري الإنشاء" : "إنشاء عنصر محتوى"}
        </Button>
        {/* The "فتح إدارة المحتوى" link pointed at /dashboard/operations/content, removed with
            التشغيل. Creation still works; the feedback line below is now the whole result. */}
      </div>
      {disabled && disabledReason ? <p className="mt-2 text-xs font-semibold text-slate-500">{disabledReason}</p> : null}
      {feedback ? (
        <p className={`mt-2 rounded-md border px-3 py-2 text-xs font-semibold ${feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
