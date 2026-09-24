"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type BlogHealth = {
  total: number;
  published: number;
  emptyBody: number;
  missingImage: number;
  translations: number;
  emptyTranslationBody: number;
  lastUpdatedAt: string | null;
  checkedAt: string;
};

/**
 * Live counts from the database this deployment uses. Checked after any bulk
 * blog import: a committed seed is not proof production was updated.
 */
export function BlogHealthCard() {
  const [data, setData] = useState<BlogHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<BlogHealth>("/api/admin/blog/health");
      setData(res.data);
    } catch {
      setError("تعذّر قراءة حالة المدونة من قاعدة البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const metrics: Array<{ label: string; value: number | undefined; warn?: boolean }> = [
    { label: "إجمالي المقالات", value: data?.total },
    { label: "منشورة", value: data?.published },
    { label: "بدون نص (العربية)", value: data?.emptyBody, warn: (data?.emptyBody ?? 0) > 0 },
    { label: "بدون صورة", value: data?.missingImage, warn: (data?.missingImage ?? 0) > 0 },
    { label: "ترجمات محفوظة", value: data?.translations },
    { label: "ترجمات بدون نص", value: data?.emptyTranslationBody, warn: (data?.emptyTranslationBody ?? 0) > 0 },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">حالة المدونة في قاعدة البيانات الفعلية</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            أرقام حيّة من قاعدة بيانات هذا الموقع. رفع ملف استيراد إلى المستودع لا يعني أن قاعدة الإنتاج تحدّثت — تحقق من هنا.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </CardHeader>
      <CardContent>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {metrics.map((m) => (
            <div key={m.label} className={`rounded-lg border p-3 ${m.warn ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
              <p className="text-[11px] font-semibold text-slate-500">{m.label}</p>
              <p className={`mt-1 text-lg font-bold tabular-nums ${m.warn ? "text-amber-700" : "text-slate-900"}`}>{m.value ?? "—"}</p>
            </div>
          ))}
        </div>
        {data ? (
          <p className="mt-3 text-[11px] text-slate-500">
            آخر تعديل على مقال: {data.lastUpdatedAt ? new Date(data.lastUpdatedAt).toLocaleString("ar") : "—"} · وقت الفحص:{" "}
            {new Date(data.checkedAt).toLocaleString("ar")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
