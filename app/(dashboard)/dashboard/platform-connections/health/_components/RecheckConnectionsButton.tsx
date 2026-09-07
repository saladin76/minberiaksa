"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

export function RecheckConnectionsButton({ providers }: { providers: string[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function recheck() {
    if (!window.confirm("سيتم فحص التكوين العامل لجميع المزودين دون اختبار التغييرات أو تشغيل الحملات. هل تريد المتابعة؟")) return;
    setLoading(true);
    setMessage(null);
    try {
      const results = await Promise.all(providers.map(async (provider) => {
        const response = await fetch(`/api/admin/integration-settings/${provider}/test-active`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        const body = await response.json().catch(() => ({}));
        return response.ok && body.success;
      }));
      setMessage(`اكتمل الفحص: ${results.filter(Boolean).length} من ${results.length} اتصال ناجح.`);
      router.refresh();
    } catch {
      setMessage("تعذر إكمال فحص جميع الاتصالات.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" disabled={loading} onClick={recheck} className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-bold text-white disabled:opacity-50">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        إعادة فحص الاتصالات
      </button>
      {message ? <p role="status" className="text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
