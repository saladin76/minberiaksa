"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LOCALES, SUPPORTED_LOCALES } from "@/lib/locales";
import { CONFIG, type ContentKind } from "@/lib/content-editor/contracts";
type Status = {
  complete: boolean;
  missing: string[];
  seoComplete: boolean;
  reviewed: boolean;
};
type Row = { id: string; title: string; statuses: Record<string, Status> };
export function TranslationOverview({ kind }: { kind: ContentKind }) {
  const [items, setItems] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [filter, setFilter] = useState(""),
    [language, setLanguage] = useState("en");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let cursor: string | null = null;
      const all: Row[] = [];
      do {
        const res: Response = await fetch(
          `/api/admin/content-editor/${kind}${cursor ? "?cursor=" + encodeURIComponent(cursor) : ""}`,
          { cache: "no-store" },
        );
        const data: {
          items: Row[];
          nextCursor: string | null;
          error?: string;
        } = await res.json();
        if (!res.ok) throw new Error(data.error || "تعذر التحميل");
        all.push(...data.items);
        cursor = data.nextCursor;
      } while (cursor);
      setItems(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر التحميل");
    } finally {
      setLoading(false);
    }
  }, [kind]);
  useEffect(() => {
    void load();
  }, [load]);
  const normalize = (v: string) =>
    v
      .normalize("NFKD")
      .replace(/[\u064b-\u065f\u0670ـ]/g, "")
      .replace(/[أإآ]/g, "ا")
      .toLowerCase();
  const visible = items.filter((row) =>
    normalize(row.title).includes(normalize(filter)),
  );
  const complete = items.filter(
    (row) => row.statuses[language]?.complete,
  ).length;
  const reviewed = items.filter(
    (row) => row.statuses[language]?.reviewed,
  ).length;
  const seo = items.filter((row) => row.statuses[language]?.seoComplete).length;
  return (
    <section dir="rtl" className="space-y-4 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">
          اللغات والمراجعة · {CONFIG[kind].label}
        </h2>
        <button
          type="button"
          className="rounded border px-3 py-2 text-sm"
          disabled={loading}
          onClick={load}
        >
          تحديث الإحصاءات
        </button>
      </div>
      {kind === "categories" ? (
        <p className="text-sm text-slate-500">
          التصنيفات تجمع المشاريع وترتبها. الأقسام الكبرى صفحات برامج تضم مشاريع
          ومقالات ومواد أخرى.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <label className="space-x-2">
          <span className="ml-2 text-sm">اللغة</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded border p-2"
          >
            {SUPPORTED_LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALES[code].nativeLabel}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">البحث في المحتوى</span>
          <input
            placeholder="ابحث بالعنوان"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded border p-2"
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : loading ? (
        <p role="status">تحميل الإحصاءات…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["مكتمل", complete],
              ["يحتاج ترجمة", items.length - complete],
              ["راجعه الفريق", reviewed],
              [
                kind === "urgent-banners" ? "وصف الصورة مكتمل" : "SEO مكتمل",
                seo,
              ],
            ].map(([label, count]) => (
              <div key={String(label)} className="rounded-lg border p-3">
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-sm text-slate-500">{label}</p>
              </div>
            ))}
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              تفاصيل العناصر وفتح المحرر ({visible.length})
            </summary>
            <div className="mt-3 max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-right">
                    <th className="p-2">العنصر</th>
                    <th>الترجمات</th>
                    <th>
                      {LOCALES[language as keyof typeof LOCALES]?.nativeLabel}
                    </th>
                    <th>المراجعة</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="p-2">
                        <Link
                          className="text-blue-800 underline"
                          href={`/dashboard/content/${kind}/${row.id}`}
                        >
                          {row.title || "دون عنوان"}
                        </Link>
                      </td>
                      <td>
                        {
                          SUPPORTED_LOCALES.filter(
                            (l) => l !== "ar" && row.statuses[l]?.complete,
                          ).length
                        }
                        /{SUPPORTED_LOCALES.length - 1}
                      </td>
                      <td>
                        {row.statuses[language]?.complete
                          ? "مكتمل"
                          : `ناقص (${row.statuses[language]?.missing.length || 0})`}
                      </td>
                      <td>
                        {row.statuses[language]?.reviewed
                          ? "مراجع"
                          : "بحاجة للمراجعة"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visible.length ? <p className="p-3">لا توجد نتائج</p> : null}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
