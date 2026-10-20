"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  RefreshCw,
  Archive,
  ArrowDownUp,
  Filter,
  CheckCircle2,
  Languages,
} from "lucide-react";
import { SUPPORTED_LOCALES } from "@/lib/locales";
import { ContentLocalizationAuditCard } from "@/app/(dashboard)/dashboard/_components/ContentLocalizationAuditCard";
type State = { complete: boolean; seoComplete: boolean; reviewed: boolean };
type Row = {
  id: string;
  title: string;
  searchTitles: string[];
  priority: number;
  image: string;
  isActive: boolean;
  archived: boolean;
  targetAmount: number;
  currentAmount: number;
  goalType: string;
  categories: { id: string; name: string }[];
  revision: string;
  statuses: Record<string, State>;
};
type View = {
  name: string;
  query: string;
  category: string;
  progress: string;
  tab: string;
};
const btn =
  "inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40 hover:bg-slate-50";
const input = "rounded-lg border bg-white px-3 py-2 text-sm";
const storageKey = "campaign-workspace-views-v1";
const endpoint = "/api/admin/content-editor/campaigns/workspace-list";
export function CampaignWorkspaceList() {
  const [rows, setRows] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [progress, setProgress] = useState("all"),
    [tab, setTab] = useState("active"),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string[]>([]),
    [sort, setSort] = useState("priority"),
    [views, setViews] = useState<View[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(saved))
        setViews(
          saved
            .filter(
              (v) =>
                v &&
                typeof v.name === "string" &&
                typeof v.query==='string'&&typeof v.category==='string'&&['all','ongoing','complete'].includes(v.progress)&&
                ["active", "inactive", "archive"].includes(v.tab),
            )
            .slice(0, 12),
        );
    } catch {
      /* private mode or obsolete saved views */
    }
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const all: Row[] = [];
      let cursor: string | null = null;
      const seen = new Set<string>();
      do {
        const response: Response = await fetch(
          endpoint + (cursor ? "?cursor=" + cursor : ""),
          { cache: "no-store" },
        );
        const data: {
          items: Row[];
          nextCursor: string | null;
          error?: string;
        } = await response.json();
        if (!response.ok) throw new Error(data.error);
        all.push(...data.items);
        cursor = data.nextCursor;
        if (cursor && seen.has(cursor))
          throw new Error("تعذر متابعة تحميل المشاريع");
        if (cursor) seen.add(cursor);
        if (seen.size > 500)
          throw new Error("القائمة أكبر من حد التحميل؛ ضيّق نطاق البيانات");
      } while (cursor);
      setRows(all);
      setSelected([]);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "تعذر التحميل");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [query, category, progress, tab]);
  const categories = useMemo(
    () =>
      Array.from(
        new Map(
          rows.flatMap((r) => r.categories).map((c) => [c.id, c]),
        ).values(),
      ),
    [rows],
  );
  const filtered = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            (tab === "archive"
              ? r.archived
              : !r.archived && (tab === "active" ? r.isActive : !r.isActive)) &&
            (category === "all" ||
              r.categories.some((c) => c.id === category)) &&
            (!query ||
              [r.id, r.title, ...r.searchTitles]
                .join(" ")
                .toLocaleLowerCase()
                .includes(query.toLocaleLowerCase())) &&
            (progress === "all" ||
              (progress === "complete"
                ? r.targetAmount > 0 && r.currentAmount >= r.targetAmount
                : r.goalType === "OPEN" || r.currentAmount < r.targetAmount)),
        )
        .sort((a, b) =>
          sort === "title"
            ? a.title.localeCompare(b.title)
            : sort === "raised"
              ? b.currentAmount - a.currentAmount
              : a.priority - b.priority || a.title.localeCompare(b.title),
        ),
    [rows, query, category, progress, tab, sort],
  );
  const visible = filtered.slice((page - 1) * 20, page * 20),
    pages = Math.max(1, Math.ceil(filtered.length / 20));
  const stats = useMemo(() => {
    let complete = 0,
      seo = 0,
      reviewed = 0;
    for (const r of filtered)
      for (const l of SUPPORTED_LOCALES.filter((l) => l !== "ar")) {
        const s = r.statuses[l];
        if (s?.complete) complete++;
        if (s?.seoComplete) seo++;
        if (s?.reviewed) reviewed++;
      }
    return {
      complete,
      seo,
      reviewed,
      total: filtered.length * (SUPPORTED_LOCALES.length - 1),
    };
  }, [filtered]);
  const update = async (
    action: string,
    items: { id: string; revision: string; order?: number }[],
  ) => {
    if (busy || !items.length) return;
    if (items.length > 50) {
      setMessage("اختر 50 مشروعًا على الأكثر للعملية الواحدة.");
      return;
    }
    if (
      action !== "order" &&
      !window.confirm(
        `تأكيد ${action === "archive" ? "أرشفة" : action === "disable" ? "تعطيل" : action === "restore" ? "استعادة ونشر" : "تفعيل"} ${items.length} مشروع؟ لن تتغير التبرعات أو إيصالاتها.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
      setMessage("تم الحفظ وإعادة قراءة القائمة.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      setBusy(false);
    }
  };
  const bulk = (action: string) =>
    void update(
      action,
      rows
        .filter((r) => selected.includes(r.id))
        .map(({ id, revision }) => ({ id, revision })),
    );
  const saveView = () => {
    const name = window.prompt("اسم العرض المحفوظ");
    if (!name?.trim()) return;
    const next = [
      ...views.filter((v) => v.name !== name.trim()),
      { name: name.trim().slice(0, 60), query, category, progress, tab },
    ].slice(-12);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setViews(next);
    } catch {
      setMessage("تعذر حفظ العرض في هذا المتصفح.");
    }
  };
  return (
    <div dir="rtl" className="mx-auto max-w-[1500px] space-y-5 text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs text-slate-400">
            إدارة المحتوى / المشاريع
          </p>
          <h1 className="text-3xl font-bold">المشاريع</h1>
          <p className="mt-2 text-sm text-slate-500">
            تحرير المحتوى واللغات، ترتيب الظهور ومراجعة جاهزية المشاريع.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={btn}
            type="button"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            <RefreshCw size={16} />
            تحديث
          </button>
          <Link
            href="/dashboard/campaigns/new"
            className={btn + " !bg-brand text-white"}
          >
            <Plus size={16} />
            مشروع جديد
          </Link>
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["المشاريع المعروضة", filtered.length, rows.length + " في القائمة"],
          ["ترجمات مكتملة", stats.complete, "من " + stats.total],
          ["إعدادات البحث", stats.seo, "من " + stats.total],
          ["مراجعة تحريرية", stats.reviewed, "من " + stats.total],
        ].map(([label, value, note], i) => (
          <section key={label} className="rounded-xl border bg-white p-5">
            <div className="flex justify-between text-sm text-slate-500">
              <span>{label}</span>
              {i === 0 ? (
                <Filter size={17} />
              ) : i === 1 ? (
                <Languages size={17} />
              ) : (
                <CheckCircle2 size={17} />
              )}
            </div>
            <strong className="my-3 block text-3xl">{value}</strong>
            <small className="text-slate-400">
              {note} · وفق الفلاتر الحالية
            </small>
          </section>
        ))}
      </div>
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 pt-3">
          <nav aria-label="حالة المشاريع" className="flex gap-5">
            {[
              ["active", "النشطة"],
              ["inactive", "غير النشطة"],
              ["archive", "الأرشيف"],
            ].map(([id, label]) => (
              <button
                type="button"
                key={id}
                className={`flex items-center gap-2 border-b-2 px-1 py-4 text-sm ${tab === id ? "border-brand font-bold text-brand" : "border-transparent text-slate-500"}`}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {id === "archive" ? <Archive size={14} /> : null}
                {label}
                <small className="rounded bg-slate-100 px-2 py-0.5">
                  {
                    rows.filter((r) =>
                      id === "archive"
                        ? r.archived
                        : !r.archived &&
                          (id === "active" ? r.isActive : !r.isActive),
                    ).length
                  }
                </small>
              </button>
            ))}
          </nav>
          <button type="button" className={btn + " mb-2"} onClick={saveView}>
            حفظ هذا العرض
          </button>
        </div>
        {views.length ? (
          <div className="flex flex-wrap gap-2 border-b bg-slate-50 px-5 py-3">
            {views.map((v) => (
              <div key={v.name} className="flex rounded-lg border bg-white">
                <button
                  type="button"
                  className="px-3 py-2 text-xs"
                  onClick={() => {
                    setQuery(v.query);
                    setCategory(v.category);
                    setProgress(v.progress);
                    setTab(v.tab);
                  }}
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  aria-label={"حذف العرض " + v.name}
                  className="px-2 text-slate-400"
                  onClick={() => {
                    const next = views.filter((x) => x.name !== v.name);
                    try {
                      localStorage.setItem(storageKey, JSON.stringify(next));
                      setViews(next);
                    } catch {
                      setMessage("تعذر حذف العرض المحفوظ.");
                    }
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 p-5">
          <label className="relative min-w-56 flex-1">
            <Search
              size={16}
              className="absolute right-3 top-3 text-slate-400"
            />
            <input
              aria-label="البحث في المشاريع"
              className={input + " w-full pr-9"}
              placeholder="بحث بكل اللغات أو معرّف المشروع…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="فلترة التصنيف"
            className={input}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">جميع التصنيفات</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="فلترة الإنجاز"
            className={input}
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
          >
            <option value="all">كل المشاريع</option>
            <option value="ongoing">قيد الإنجاز / مفتوح</option>
            <option value="complete">مكتمل الهدف</option>
          </select>
          <label className="flex items-center gap-2 text-slate-400">
            <ArrowDownUp size={16} />
            <select
              aria-label="ترتيب المشاريع"
              className={input}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="priority">ترتيب الظهور</option>
              <option value="title">العنوان</option>
              <option value="raised">الأكثر تحصيلًا</option>
            </select>
          </label>
        </div>
        {message ? (
          <p
            role="status"
            className="mx-5 mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
          >
            {message}
          </p>
        ) : null}
        {selected.length ? (
          <div className="mx-5 mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-brand/5 p-3">
            <span className="me-auto text-sm">{selected.length} محدد</span>
            {tab === "archive" ? (
              <button
                type="button"
                className={btn}
                disabled={busy}
                onClick={() => bulk("restore")}
              >
                استعادة ونشر
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={btn}
                  disabled={busy}
                  onClick={() => bulk(tab === "active" ? "disable" : "enable")}
                >
                  {tab === "active" ? "تعطيل المحدد" : "تفعيل المحدد"}
                </button>
                <button
                  type="button"
                  className={btn}
                  disabled={busy}
                  onClick={() => bulk("archive")}
                >
                  أرشفة المحدد
                </button>
              </>
            )}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-right text-sm">
            <thead className="border-y bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-10 p-4">
                  <input
                    aria-label="تحديد مشاريع الصفحة"
                    type="checkbox"
                    disabled={loading || busy}
                    checked={
                      visible.length > 0 &&
                      visible.every((r) => selected.includes(r.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? Array.from(
                              new Set([
                                ...selected,
                                ...visible.map((r) => r.id),
                              ]),
                            )
                          : selected.filter(
                              (id) => !visible.some((r) => r.id === id),
                            ),
                      )
                    }
                  />
                </th>
                {[
                  "الترتيب",
                  "المشروع",
                  "التصنيفات",
                  "المحصّل / الهدف",
                  "اللغات والمراجعة",
                  "",
                ].map((h, i) => (
                  <th key={h + i} className="p-4 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    تحميل المشاريع…
                  </td>
                </tr>
              ) : (
                visible.map((row) => {
                  const done = SUPPORTED_LOCALES.filter(
                    (l) => l !== "ar" && row.statuses[l]?.complete,
                  ).length;
                  return (
                    <tr key={row.id} className="border-b hover:bg-slate-50/70">
                      <td className="p-4">
                        <input
                          type="checkbox"
                          aria-label={"تحديد " + row.title}
                          checked={selected.includes(row.id)}
                          disabled={busy}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, row.id]
                                : selected.filter((id) => id !== row.id),
                            )
                          }
                        />
                      </td>
                      <td className="p-4">
                        <input
                          type="number"
                          min="0"
                          max="1000000"
                          aria-label={"ترتيب " + row.title}
                          className="w-16 rounded border p-2 text-center"
                          defaultValue={row.priority}
                          key={row.revision}
                          disabled={busy}
                          onBlur={(e) => {
                            const order = Number(e.target.value);
                            if (order !== row.priority)
                              void update("order", [
                                { id: row.id, revision: row.revision, order },
                              ]);
                          }}
                        />
                      </td>
                      <td className="max-w-sm p-4">
                        <Link
                          href={`/dashboard/campaigns/edit/${row.id}`}
                          className="font-semibold hover:text-brand"
                        >
                          {row.title}
                        </Link>
                        <small
                          className="mt-1 block text-[10px] text-slate-400"
                          dir="ltr"
                        >
                          {row.id}
                        </small>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {row.categories.map((c) => (
                            <span
                              key={c.id}
                              className="rounded bg-slate-100 px-2 py-1 text-xs"
                            >
                              {c.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="font-semibold" dir="ltr">
                          $
                          {row.currentAmount.toLocaleString("en-US", {
                            maximumFractionDigits: 2,
                          })}
                        </p>
                        <small className="text-slate-400">
                          {row.goalType === "OPEN"
                            ? "هدف مفتوح"
                            : `من $${row.targetAmount.toLocaleString("en-US")}`}
                        </small>
                        {row.goalType !== "OPEN" && row.targetAmount > 0 ? (
                          <progress
                            className="mt-2 block h-1.5 w-28 accent-brand"
                            max={row.targetAmount}
                            value={Math.min(
                              row.currentAmount,
                              row.targetAmount,
                            )}
                          />
                        ) : null}
                      </td>
                      <td className="p-4">
                        <span>
                          {done} / {SUPPORTED_LOCALES.length - 1} ترجمة
                        </span>
                        <div className="mt-2 flex gap-1">
                          {SUPPORTED_LOCALES.filter((l) => l !== "ar").map(
                            (l) => (
                              <span
                                key={l}
                                title={`${l.toUpperCase()} · ${row.statuses[l]?.reviewed ? "مراجع" : row.statuses[l]?.complete ? "مكتمل" : "ناقص"}`}
                                className={`h-1.5 w-1.5 rounded-full ${row.statuses[l]?.reviewed ? "bg-emerald-600" : row.statuses[l]?.complete ? "bg-amber-500" : "bg-slate-200"}`}
                              />
                            ),
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <Link
                          className={btn}
                          href={`/dashboard/campaigns/edit/${row.id}`}
                        >
                          تحرير
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
              {!loading && !visible.length ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    لا توجد مشاريع تطابق هذا العرض.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <footer className="flex items-center justify-between p-4 text-xs text-slate-500">
          <span>
            {filtered.length} مشروع · الصفحة {Math.min(page, pages)} من {pages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className={btn}
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              السابق
            </button>
            <button
              type="button"
              className={btn}
              disabled={page >= pages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              التالي
            </button>
          </div>
        </footer>
      </section>
      <ContentLocalizationAuditCard section="campaigns" />
    </div>
  );
}
