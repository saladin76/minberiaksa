"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { LOCALES, SUPPORTED_LOCALES } from "@/lib/locales";
import { CONFIG, type ContentKind } from "@/lib/content-editor/contracts";
import { dashDir, dt } from "@/lib/dashboard/i18n";
type Status = {
  complete: boolean;
  missing: string[];
  seoComplete: boolean;
  reviewed: boolean;
};
type Row = { id: string; title: string; statuses: Record<string, Status> };
export function TranslationOverview({
  kind,
  scopeIds,
  children,
}: {
  kind: ContentKind;
  scopeIds?: string[];
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const loadedKind = useRef<ContentKind | null>(null);
  const generation = useRef(0);
  const [items, setItems] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [filter, setFilter] = useState(""),
    [language, setLanguage] = useState("en");
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      let cursor: string | null = null;
      const all: Row[] = [];
      const seen = new Set<string>();
      do {
        const res: Response = await fetch(
          `/api/admin/content-editor/${kind}${cursor ? "?cursor=" + encodeURIComponent(cursor) : ""}`,
          { cache: "no-store", signal },
        );
        const data: {
          items: Row[];
          nextCursor: string | null;
          error?: string;
        } = await res.json();
        if (!res.ok) throw new Error(data.error || dt("تعذر التحميل"));
        if (signal?.aborted || current !== generation.current) return;
        all.push(...data.items);
        cursor = data.nextCursor;
        if (cursor) {
          if (seen.has(cursor) || seen.size >= 500)
            throw new Error(dt("تعذر استكمال إحصاءات المحتوى؛ أعد المحاولة"));
          seen.add(cursor);
        }
      } while (cursor);
      loadedKind.current = kind;
      setItems(all);
    } catch (e) {
      if (!signal?.aborted && current === generation.current) setError(e instanceof Error ? e.message : dt("تعذر التحميل"));
    } finally {
      if (!signal?.aborted && current === generation.current) setLoading(false);
    }
  }, [kind]);
  useEffect(() => {
    if (!expanded || loadedKind.current === kind) return;
    const controller = new AbortController(); void load(controller.signal);
    return () => controller.abort();
  }, [expanded, kind, load]);
  const normalize = (v: string) =>
    v
      .normalize("NFKD")
      .replace(/[\u064b-\u065f\u0670ـ]/g, "")
      .replace(/[أإآ]/g, "ا")
      .toLowerCase();
  const visible = items.filter(
    (row) =>
      (!scopeIds || scopeIds.includes(row.id)) &&
      normalize(row.title).includes(normalize(filter)),
  );
  const complete = visible.filter(
    (row) => row.statuses[language]?.complete,
  ).length;
  const reviewed = visible.filter(
    (row) => row.statuses[language]?.reviewed,
  ).length;
  const seo = visible.filter(
    (row) => row.statuses[language]?.seoComplete,
  ).length;
  const kindLabel = dt(CONFIG[kind].label);
  return (
    <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)} dir={dashDir()} className="rounded-xl border bg-white p-5">
      <summary className="cursor-pointer text-sm font-semibold">{dt("اللغات والمراجعة")} · {kindLabel}</summary>
      <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="rounded border px-3 py-2 text-sm"
          disabled={loading}
          onClick={() => void load()}
        >
          {dt("تحديث الإحصاءات")}
        </button>
      </div>
      {kind === "categories" ? (
        <p className="text-sm text-slate-500">
          {dt("التصنيفات تجمع المشاريع وترتبها. الأقسام الكبرى صفحات برامج تضم مشاريع ومقالات ومواد أخرى.")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <label className="space-x-2">
          <span className="ms-2 text-sm">{dt("اللغة")}</span>
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
          <span className="sr-only">{dt("البحث في المحتوى")}</span>
          <input
            aria-label={dt("البحث في المحتوى")}
            placeholder={dt("ابحث بالعنوان")}
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
        <p role="status">{dt("تحميل الإحصاءات…")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              [dt("مكتمل"), complete],
              [dt("يحتاج ترجمة"), visible.length - complete],
              [dt("راجعه الفريق"), reviewed],
              [
                kind === "urgent-banners" ? dt("وصف الصورة مكتمل") : dt("SEO مكتمل"),
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
              {dt("تفاصيل العناصر وفتح المحرر ({0})", [visible.length])}
            </summary>
            <div className="mt-3 max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-start">
                    <th className="p-2">{dt("العنصر")}</th>
                    <th>{dt("الترجمات")}</th>
                    <th>
                      {LOCALES[language as keyof typeof LOCALES]?.nativeLabel}
                    </th>
                    <th>{dt("المراجعة")}</th>
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
                          {row.title || dt("دون عنوان")}
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
                          ? dt("مكتمل")
                          : dt("ناقص ({0})", [row.statuses[language]?.missing.length || 0])}
                      </td>
                      <td>
                        {row.statuses[language]?.reviewed
                          ? dt("مراجع")
                          : dt("بحاجة للمراجعة")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visible.length ? <p className="p-3">{dt("لا توجد نتائج")}</p> : null}
            </div>
          </details>
        </>
      )}
      {children}
      </div>
    </details>
  );
}
