"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Layers3, ExternalLink, Loader2 } from "lucide-react";

type Props = { assetId: string; fileName: string };

/**
 * Compact "use in content" action for the archive daily-work list. Reuses the existing, already
 * supported create-content-item endpoint — it does not add any new backend behavior.
 */
export function ArchiveAssetUseInContent({ assetId, fileName }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (saving) return;
    if (!window.confirm(`استخدام هذه المادة في المحتوى: ${fileName}؟`)) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/archive/assets/${encodeURIComponent(assetId)}/create-content-item`, { method: "POST" });
    const result = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok || !result?.ok) {
      setError(result?.error || result?.message || "تعذّر إنشاء عنصر المحتوى");
      return;
    }
    setDone(true);
    router.refresh();
  }

  // Was a link to /dashboard/operations/content, removed with التشغيل. The content item is still
  // created by the same API; there is no page left to open, so this confirms and stops there.
  if (done) {
    return <span className="text-xs font-bold text-emerald-700">تم إنشاء عنصر المحتوى</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={run}
        disabled={saving}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-brand/30 bg-brand/5 px-3 text-xs font-bold text-brand transition hover:bg-brand/10 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers3 className="h-3.5 w-3.5" />}
        استخدام في محتوى
      </button>
      {error ? <span className="text-[11px] font-semibold text-rose-600">{error}</span> : null}
    </div>
  );
}
