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
  FolderKanban,
} from "lucide-react";
import { SUPPORTED_LOCALES } from "@/lib/locales";
import { ContentLocalizationAuditCard } from "@/app/(dashboard)/dashboard/_components/ContentLocalizationAuditCard";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ContentMetricStrip } from "@/components/dashboard/content-editor/ContentMetricStrip";
import { dashDir, dt, dtx } from "@/lib/dashboard/i18n";
import { useDashboardUnsavedChanges } from "@/hooks/useDashboardUnsavedChanges";
import { compareProjectOrder } from "@/lib/content-editor/project-order";
type State = { complete: boolean; seoComplete: boolean; reviewed: boolean };
type Row = {
  id: string;
  title: string;
  searchTitles: string[];
  priority: number | null;
  createdAt: string;
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
  const [orderDraft, setOrderDraft] = useState<Record<string, string>>({});
  const orderCount = Object.keys(orderDraft).length;
  const invalidOrder = Object.values(orderDraft).some((value) => value !== "" && (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 1000000));
  useDashboardUnsavedChanges(orderCount > 0);
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
          throw new Error(dt("تعذّر متابعة تحميل المشاريع"));
        if (cursor) seen.add(cursor);
        if (seen.size > 500)
          throw new Error(dt("القائمة أكبر من حد التحميل؛ ضيّق نطاق البيانات"));
      } while (cursor);
      setRows(all);
      setSelected([]);
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : dt("تعذّر التحميل"));
      return false;
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
              : compareProjectOrder(a, b),
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
    items: { id: string; revision: string; order?: number | null }[],
  ) => {
    if (busy || !items.length) return;
    if (action !== "order" && orderCount) {
      setMessage(dt("احفظ تغييرات الترتيب أو تراجع عنها أولًا."));
      return;
    }
    if (items.length > (action === "order" ? 500 : 50)) {
      setMessage(dt("اختر 50 مشروعًا على الأكثر للعملية الواحدة."));
      return;
    }
    if (
      action !== "order" &&
      !window.confirm(
        dt("تأكيد {0} {1} مشروعًا؟ لن تتغير التبرعات أو إيصالاتها.", [
          action === "archive" ? dt("أرشفة") : action === "disable" ? dt("تعطيل") : action === "restore" ? dt("استعادة ونشر") : dt("تفعيل"),
          items.length,
        ]),
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
      if (!await load()) throw new Error(dt("تم الحفظ لكن تعذر تحديث القائمة. أعد تحميلها للتحقق."));
      if (action === "order") setOrderDraft({});
      setMessage(dt("تم الحفظ وإعادة قراءة القائمة."));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : dt("تعذّر الحفظ"));
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
    const name = window.prompt(dt("اسم العرض المحفوظ"));
    if (!name?.trim()) return;
    const next = [
      ...views.filter((v) => v.name !== name.trim()),
      { name: name.trim().slice(0, 60), query, category, progress, tab },
    ].slice(-12);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setViews(next);
    } catch {
      setMessage(dt("تعذّر حفظ العرض في هذا المتصفح."));
    }
  };
  const saveOrder = () => void update("order", rows.filter((row) => row.id in orderDraft).map((row) => ({ id: row.id, revision: row.revision, order: orderDraft[row.id] === "" ? null : Number(orderDraft[row.id]) })));
  return (
    <div dir={dashDir()} className="mx-auto max-w-[1500px] space-y-5 text-slate-800">
      <PageHeader
        eyebrow={dt("استوديو المحتوى")}
        title={dt("المشاريع")}
        description={dt("حرّر المحتوى والترجمات، رتّب الظهور، وتابع جاهزية كل مشروع للنشر.")}
        icon={FolderKanban}
        actions={<div className="flex flex-wrap gap-2">
          <button type="button" className={btn + " !bg-brand text-white"} disabled={!orderCount || invalidOrder || busy || loading} onClick={saveOrder}>
            {dt("حفظ الترتيب")} {orderCount ? "(" + orderCount + ")" : ""}
          </button>
          <button type="button" className={btn} disabled={!orderCount || busy} onClick={() => setOrderDraft({})}>{dt("التراجع")}</button>
          <button
            className={btn}
            type="button"
            disabled={loading || busy}
            onClick={() => {
              if (orderCount && !window.confirm(dt("توجد تغييرات ترتيب غير محفوظة. إلغاؤها وإعادة التحميل؟"))) return;
              setOrderDraft({});
              void load();
            }}
          >
            <RefreshCw size={16} />
            {dt("تحديث")}
          </button>
          <Link
            href="/dashboard/campaigns/new"
            className={btn + " !bg-brand text-white"}
          >
            <Plus size={16} />
            {dt("مشروع جديد")}
          </Link>
        </div>}
      />
      <ContentMetricStrip items={[
        { label: dt("المشاريع المعروضة"), value: filtered.length, detail: dt("من {0} مشروعًا في القائمة", [rows.length]), icon: Filter, tone: "brand" },
        { label: dt("ترجمات مكتملة"), value: stats.complete, detail: dt("من أصل {0} موضع ترجمة", [stats.total]), icon: Languages, tone: "green" },
        { label: dt("بيانات SEO مكتملة"), value: stats.seo, detail: dt("من أصل {0} موضع ترجمة", [stats.total]), icon: CheckCircle2, tone: "amber" },
        { label: dt("مراجعات تحريرية مكتملة"), value: stats.reviewed, detail: dt("من أصل {0} موضع ترجمة", [stats.total]), icon: CheckCircle2, tone: "slate" },
      ]} />
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 pt-3">
          <nav aria-label={dt("حالة المشاريع")} className="flex gap-5">
            {[
              ["active", dt("النشطة")],
              ["inactive", dt("غير النشطة")],
              ["archive", dt("الأرشيف")],
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
            {dt("حفظ هذا العرض")}
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
                  aria-label={dt("حذف العرض {0}", [v.name])}
                  className="px-2 text-slate-400"
                  onClick={() => {
                    const next = views.filter((x) => x.name !== v.name);
                    try {
                      localStorage.setItem(storageKey, JSON.stringify(next));
                      setViews(next);
                    } catch {
                      setMessage(dt("تعذّر حذف العرض المحفوظ."));
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
              className="absolute start-3 top-3 text-slate-400"
            />
            <input
              aria-label={dt("البحث في المشاريع")}
              className={input + " w-full ps-9"}
              placeholder={dt("بحث بكل اللغات أو معرّف المشروع…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label={dt("فلترة التصنيف")}
            className={input}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">{dt("جميع التصنيفات")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label={dt("فلترة الإنجاز")}
            className={input}
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
          >
            <option value="all">{dt("كل المشاريع")}</option>
            <option value="ongoing">{dt("قيد الإنجاز / مفتوح")}</option>
            <option value="complete">{dt("مكتمل الهدف")}</option>
          </select>
          <label className="flex items-center gap-2 text-slate-400">
            <ArrowDownUp size={16} />
            <select
              aria-label={dt("ترتيب المشاريع")}
              className={input}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="priority">{dt("ترتيب الظهور")}</option>
              <option value="title">{dt("العنوان")}</option>
              <option value="raised">{dt("الأكثر تحصيلًا")}</option>
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
            <span className="me-auto text-sm">{dtx("محدد: {0}", [selected.length])}</span>
            {tab === "archive" ? (
              <button
                type="button"
                className={btn}
                disabled={busy}
                onClick={() => bulk("restore")}
              >
                {dt("استعادة ونشر")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={btn}
                  disabled={busy}
                  onClick={() => bulk(tab === "active" ? "disable" : "enable")}
                >
                  {tab === "active" ? dt("تعطيل المحدد") : dt("تفعيل المحدد")}
                </button>
                <button
                  type="button"
                  className={btn}
                  disabled={busy}
                  onClick={() => bulk("archive")}
                >
                  {dt("أرشفة المحدد")}
                </button>
              </>
            )}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-start text-sm">
            <thead className="border-y bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-10 p-4">
                  <input
                    aria-label={dt("تحديد مشاريع الصفحة")}
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
                  dt("الترتيب"),
                  dt("المشروع"),
                  dt("التصنيفات"),
                  dt("المحصّل / الهدف"),
                  dt("اللغات والمراجعة"),
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
                    {dt("تحميل المشاريع…")}
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
                          aria-label={dt("تحديد {0}", [row.title])}
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
                          aria-label={dt("ترتيب {0}", [row.title])}
                          className="w-16 rounded border p-2 text-center"
                          value={orderDraft[row.id] ?? (row.priority === null ? "" : String(row.priority))}
                          placeholder="—"
                          disabled={busy}
                          onChange={(event) => {
                            const value = event.target.value;
                            setOrderDraft((previous) => {
                              const next = { ...previous };
                              if (value === (row.priority === null ? "" : String(row.priority))) delete next[row.id];
                              else next[row.id] = value;
                              return next;
                            });
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
                            ? dt("هدف مفتوح")
                            : dt("من ${0}", [row.targetAmount.toLocaleString("en-US")])}
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
                          {dtx("{0} / {1} ترجمة", [done, SUPPORTED_LOCALES.length - 1])}
                        </span>
                        <div className="mt-2 flex gap-1">
                          {SUPPORTED_LOCALES.filter((l) => l !== "ar").map(
                            (l) => (
                              <span
                                key={l}
                                title={`${l.toUpperCase()} · ${row.statuses[l]?.reviewed ? dt("مراجع") : row.statuses[l]?.complete ? dt("مكتمل") : dt("ناقص")}`}
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
                          {dt("تحرير")}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
              {!loading && !visible.length ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    {dt("لا توجد مشاريع تطابق هذا العرض.")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <footer className="flex items-center justify-between p-4 text-xs text-slate-500">
          <span>
            {dtx("{0} مشروع · الصفحة {1} من {2}", [filtered.length, Math.min(page, pages), pages])}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className={btn}
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              {dt("السابق")}
            </button>
            <button
              type="button"
              className={btn}
              disabled={page >= pages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              {dt("التالي")}
            </button>
          </div>
        </footer>
      </section>
      <ContentLocalizationAuditCard section="campaigns" />
    </div>
  );
}
