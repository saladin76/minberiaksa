"use client";
import { toast } from "react-hot-toast";
import { dashDir, dt } from "@/lib/dashboard/i18n";
import { readFaqDraft } from "@/lib/content-editor/faq";
import { useDashboardUnsavedChanges } from "@/hooks/useDashboardUnsavedChanges";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { slugify } from "@/lib/slug";
import { slugFor } from "@/lib/minbar/routes";
import dynamic from "next/dynamic";
import { EditorModal } from "./EditorModal";
import { ProgrammeWorkspace } from "./ProgrammeWorkspace";
import { WorkspacePreview } from "./WorkspacePreview";
import { WorkspaceSettings, useEditorCatalog } from "./WorkspaceSettings";
import { SeoWorkspace } from "./SeoWorkspace";
import { EDITOR_SECTIONS, settingsFor } from "@/lib/content-editor/workspace";
import type { ContentRecord } from "@/lib/content-editor/contracts";
import {
  FileText,
  Wallet,
  Image as ImageIcon,
  Search,
  History,
  Grid2X2,
  Link2,
  CheckCircle2,
  Heart,
  Settings,
  Eye,
  Save,
  ArrowRight,
  Globe2,
  Undo2,
} from "lucide-react";
import { LOCALES, SUPPORTED_LOCALES } from "@/lib/locales";
import {
  CONFIG,
  localeStatus,
  type ContentField,
  type ContentKind,
  type TextValues,
} from "@/lib/content-editor/contracts";
import type { documentFor } from "@/lib/content-editor/service";
const CategoryOrderDialog = dynamic(
  () =>
    import(
      "@/app/(dashboard)/dashboard/categories/_components/CategoryCampaignPriorityDialog"
    ).then((m) => m.CategoryCampaignPriorityDialog),
  { ssr: false },
);
const RichEditor = dynamic(
  () => import("@/app/[locale]/blog/_components/wysiwyg/wysiwyg-editor"),
  { ssr: false, loading: () => <p>{dt("تحميل المحرر…")}</p> },
);
type Document = ReturnType<typeof documentFor>;
type Proposal = {
  id: string;
  kind: ContentKind;
  revision: string;
  action: string;
  proposals: Record<string, { values: TextValues; warnings: string[]; research?: { summary: string; sources: { title: string; url: string }[]; accessedAt: string; locale: string } }>;
  errors: Record<string, string>;
};
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || dt("تعذر إكمال الطلب"));
  return body;
}
function previewText(value: string): string {
  try {
    const parsed = JSON.parse(value);
    if (parsed.type === "doc") {
      const read = (node: { text?: string; content?: unknown[] }): string =>
        typeof node.text === "string"
          ? node.text
          : (node.content || [])
              .map((child) =>
                read(child as { text?: string; content?: unknown[] }),
              )
              .join(" ");
      return read(parsed);
    }
  } catch {
    /* normal text */
  }
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
}
function parseRich(value: string) {
  try {
    const doc = JSON.parse(value);
    if (doc.type === "doc") return doc;
  } catch {
    /* plain or HTML */
  }
  return value || { type: "doc", content: [{ type: "paragraph" }] };
}
const button =
  "rounded-lg border px-4 py-2 text-sm disabled:opacity-50 hover:bg-slate-50";
export function ContentEditor({ kind, id }: { kind: ContentKind; id: string }) {
  const url = `/api/admin/content-editor/${kind}/${id}`;
  const [document, setDocument] = useState<Document | null>(null);
  const [values, setValues] = useState<Record<string, TextValues>>({});
  const [locale, setLocale] = useState("ar");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [generationProgress, setGenerationProgress] = useState<{ done: number; total: number } | null>(null);
  const generationAbort = useRef<AbortController | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [slug, setSlug] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [slugOpen, setSlugOpen] = useState(false);
  const [section, setSection] = useState("content");
  const [settingsDraft, setSettingsDraft] = useState<ContentRecord>({});
  const [languageReview, setLanguageReview] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploads, setUploads] = useState(0);
  const onUploadingChange = useCallback(
    (uploading: boolean) =>
      setUploads((count) => Math.max(0, count + (uploading ? 1 : -1))),
    [],
  );
  const [categoryOrderOpen, setCategoryOrderOpen] = useState(false);
  const { catalog, error: catalogError } = useEditorCatalog(kind);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const requestRef = useRef(0);
  const initialLoad = useCallback(async () => {
    const number = ++requestRef.current;
    try {
      const data = await api<Document>(url);
      if (number !== requestRef.current) return;
      setDocument(data);
      setValues(data.values);
      setSettingsDraft(settingsFor(kind, data.settings));
      setSelected(data.fields.filter((f) => !f.locked).map((f) => f.key));
      setMessage("");
    } catch (error) {
      if (number === requestRef.current)
        setMessage(error instanceof Error ? error.message : dt("تعذر التحميل"));
    }
  }, [url, kind]);
  const invalidateRequests = useCallback(() => {
    generationAbort.current?.abort();
    requestRef.current++;
  }, []);
  useEffect(() => {
    void initialLoad();
    return invalidateRequests;
  }, [initialLoad, invalidateRequests]);
  const dirty = document
    ? JSON.stringify(values) !== JSON.stringify(document.values) ||
      JSON.stringify(settingsDraft) !==
        JSON.stringify(settingsFor(kind, document.settings)) ||
      uploads > 0
    : false;
  useDashboardUnsavedChanges(dirty);
  useEffect(() => {
    if (!dirty) return;
    const navigation = (e: MouseEvent) => {
      const link = (e.target as Element).closest?.("a[href]");
      if (link && !window.confirm(dt("توجد تعديلات غير محفوظة. مغادرة المحرر؟"))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.document.addEventListener("click", navigation, true);
    return () => {
      window.document.removeEventListener("click", navigation, true);
    };
  }, [dirty]);
  const edit = (key: string, value: string) => {
    if (busy === "save" || busy === "slug") return;
    setValues((prev) => ({
      ...prev,
      [locale]: { ...prev[locale], [key]: value },
    }));
    generationAbort.current?.abort();
    setProposal(null);
    setReviewed(false);
  };
  const save = async () => {
    if (!document) return;
    if (uploads) {
      setMessage(dt("انتظر اكتمال رفع الصور قبل الحفظ"));
      return;
    }
    const captured = { ...values[locale] },
      target = locale;
    setBusy("save");
    setMessage("");
    try {
      const saved = await api<Document>(url, {
        method: "PUT",
        body: JSON.stringify({
          revision: document.revision,
          locale: target,
          changes: captured,
          reviewed,
          localeChanges: Object.fromEntries(
            Object.entries(values).filter(
              ([code, v]) =>
                JSON.stringify(v) !== JSON.stringify(document.values[code]),
            ),
          ),
          settings: Object.fromEntries(
            Object.entries(settingsDraft).filter(
              ([key, v]) =>
                JSON.stringify(v) !==
                JSON.stringify(settingsFor(kind, document.settings)[key]),
            ),
          ),
        }),
      });
      const read = await api<Document>(url);
      if (read.revision !== saved.revision)
        throw new Error(
          dt("تغيرت النسخة بعد الحفظ. احتفظ بتعديلاتك ثم أعد تحميلها للمراجعة."),
        );
      setDocument(read);
      setValues(read.values);
      setSettingsDraft(settingsFor(kind, read.settings));
      setProposal(null);
      setReviewed(false);
      setMessage(dt("تم الحفظ والتحقق من النسخة المحفوظة"));
      toast.success(dt("تم الحفظ والتحقق من النسخة المحفوظة"));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : dt("تعذر تأكيد الحفظ. احتفظ بتعديلاتك وأعد المحاولة."),
      );
    } finally {
      setBusy("");
    }
  };
  const suggest = async (action: "seo" | "translate" | "faq", all = false) => {
    if (!document || dirty) {
      setMessage(dt("احفظ التعديلات أولًا لطلب اقتراح مرتبط بالنسخة الحالية"));
      return;
    }
    const targets = action === "translate"
      ? all ? SUPPORTED_LOCALES.filter((code) => code !== "ar" && !document.statuses[code].complete) : [locale]
      : all ? [...SUPPORTED_LOCALES] : [locale];
    if (!targets.length || (action === "translate" && targets.includes("ar"))) {
      setMessage(dt("اختر لغة أخرى أو لغة تحتاج ترجمة"));
      return;
    }
    const snapshot = JSON.stringify(valuesRef.current), revision = document.revision;
    const controller = new AbortController();
    generationAbort.current?.abort();
    generationAbort.current = controller;
    setBusy(action);
    setMessage("");
    setProposal(null);
    setGenerationProgress({ done: 0, total: targets.length });
    const combined: Proposal = { id, kind, revision, action, proposals: {}, errors: {} };
    let cursor = 0, done = 0;
    try {
      await Promise.all(Array.from({ length: Math.min(2, targets.length) }, async () => {
        while (cursor < targets.length && !controller.signal.aborted) {
          const target = targets[cursor++];
          try {
            const result = await api<Proposal>(url + "/suggest", {
              method: "POST",
              signal: controller.signal,
              body: JSON.stringify({ action, locale: target, locales: [target], keys: selected, revision }),
            });
            if (result.id !== id || result.kind !== kind || result.revision !== revision)
              throw new Error(dt("الاقتراح لا يطابق المحتوى الجاري تحريره"));
            Object.assign(combined.proposals, result.proposals);
            Object.assign(combined.errors, result.errors);
          } catch (error) {
            if (!controller.signal.aborted) combined.errors[target] = error instanceof Error ? error.message : dt("تعذر إعداد الاقتراح");
          } finally {
            done++;
            setGenerationProgress({ done, total: targets.length });
          }
        }
      }));
      if (snapshot !== JSON.stringify(valuesRef.current))
        throw new Error(dt("تغير النص أثناء الطلب. اطلب اقتراحًا جديدًا."));
      if (Object.keys(combined.proposals).length || Object.keys(combined.errors).length) setProposal(combined);
      if (controller.signal.aborted) setMessage(dt("أُوقف الطلب. الاقتراحات المكتملة متاحة للمراجعة."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : dt("تعذر إعداد الاقتراح"));
    } finally {
      if (generationAbort.current === controller) {
        generationAbort.current = null;
        setGenerationProgress(null);
        setBusy("");
      }
    }
  };
  const reviseProposal = (target: string, key: string, value: string) => {
    setProposal((previous) => previous ? {
      ...previous, proposals: { ...previous.proposals, [target]: {
        ...previous.proposals[target], values: { ...previous.proposals[target].values, [key]: value },
      } },
    } : null);
  };
  const apply = (target: string, key: string, value: string) => {
    if (
      busy === "save" ||
      busy === "slug" ||
      !document ||
      proposal?.revision !== document.revision
    )
      return;
    setValues((prev) => ({
      ...prev,
      [target]: { ...prev[target], [key]: value },
    }));
    setReviewed(false);
    setProposal((previous) => {
      if (!previous?.proposals[target]) return previous;
      const pending = { ...previous.proposals[target].values };
      delete pending[key];
      const proposals = { ...previous.proposals };
      if (Object.keys(pending).length) proposals[target] = { ...proposals[target], values: pending };
      else delete proposals[target];
      return Object.keys(proposals).length ? { ...previous, proposals } : null;
    });
    const warning = proposal && Object.keys(proposal.errors).length ? " · " + Object.keys(proposal.errors).join(", ") : "";
    setMessage(dt("أضيف الاقتراح إلى المسودة. احفظ جميع التغييرات بعد المراجعة.") + warning);
  };
  const changeSlug = async () => {
    if (!document || dirty) {
      setMessage(dt("احفظ تعديلات المحتوى قبل تغيير الرابط"));
      return;
    }
    setBusy("slug");
    try {
      const saved = await api<Document>(url, {
        method: "PUT",
        body: JSON.stringify({
          action: "slug",
          locale,
          revision: document.revision,
          slug,
          confirmation,
        }),
      });
      setDocument(saved);
      setValues(saved.values);
      setSlugOpen(false);
      setConfirmation("");
      setProposal(null);
      setMessage(dt("تم تغيير الرابط وحفظ الرابط السابق في السجل"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : dt("تعذر تغيير الرابط"));
    } finally {
      setBusy("");
    }
  };
  if (!document)
    return (
      <div dir={dashDir()} className="rounded-xl border p-6" role="status">
        {message || dt("تحميل المحتوى…")}
        <button type="button" className={button} onClick={initialLoad}>
          {dt("إعادة المحاولة")}
        </button>
      </div>
    );
  const current = values[locale] || {},
    source = values.ar || {},
    status = localeStatus(document.fields, source, current, locale);
  const done = SUPPORTED_LOCALES.filter(
    (l) => l !== "ar" && document.statuses[l].complete,
  ).length;
  const isBanner = kind === "urgent-banners";
  const liveSettings = {
    ...document.settings,
    ...settingsDraft,
    blocks: Array.isArray(settingsDraft.blocks)
      ? settingsDraft.blocks.map((item: ContentRecord) => {
          const key = `blocks.${item.id}.`;
          return {
            ...item,
            title:
              current[key + "title"] || source[key + "title"] || item.title,
            body: current[key + "body"] || source[key + "body"],
          };
        })
      : document.settings.blocks,
  };
  const sectionIcons = {
    file: FileText,
    wallet: Wallet,
    image: ImageIcon,
    search: Search,
    history: History,
    grid: Grid2X2,
    link: Link2,
    check: CheckCircle2,
    heart: Heart,
    settings: Settings,
  };
  const setSetting = (key: string, value: unknown) => {
    setSettingsDraft((prev) => ({ ...prev, [key]: value }));
    setProposal(null);
  };
  const resetDraft = () => {
    if (!dirty || window.confirm(dt("التراجع عن كل التعديلات غير المحفوظة؟"))) {
      setValues(document.values);
      setSettingsDraft(settingsFor(kind, document.settings));
      setProposal(null);
      setReviewed(false);
    }
  };
  const languageButtons = (
    <nav
      aria-label={dt("لغات المحتوى")}
      className="flex flex-wrap gap-1.5 rounded-xl border bg-white p-3"
    >
      {SUPPORTED_LOCALES.map((code) => (
        <button
          type="button"
          key={code}
          aria-label={LOCALES[code].nativeLabel}
          title={LOCALES[code].nativeLabel}
          disabled={Boolean(busy)}
          onClick={() => {
            setLocale(code);
            setReviewed(false);
          }}
          aria-pressed={locale === code}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${locale === code ? "border-brand bg-brand/5 font-bold text-brand" : "text-slate-500"}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${document.statuses[code].reviewed ? "bg-emerald-600" : document.statuses[code].complete ? "bg-amber-500" : "bg-slate-300"}`}
          />
          {code.toUpperCase()}
        </button>
      ))}
    </nav>
  );
  const renderField = (field: ContentField) => (
    <section
      key={field.key}
      className="space-y-2 rounded-xl border bg-white p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={`content-${locale}-${field.key}`}
          className="font-semibold text-sm"
        >
          {dt(field.label)}
        </label>
        {!field.locked ? (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={selected.includes(field.key)}
              onChange={(e) =>
                setSelected((prev) =>
                  e.target.checked
                    ? [...prev, field.key]
                    : prev.filter((k) => k !== field.key),
                )
              }
            />
            {dt("ترجمة")}
          </label>
        ) : (
          <span className="text-xs text-slate-500">{dt("مراجعة يدوية")}</span>
        )}
      </div>
      {field.rich ? (
        <div
          id={`content-${locale}-${field.key}`}
          aria-label={dt(field.label)}
          dir={LOCALES[locale as keyof typeof LOCALES]?.direction || "ltr"}
        >
          <RichEditor
            key={`${locale}-${field.key}`}
            isEditable={busy !== "save" && busy !== "slug"}
            defaultValue={parseRich(current[field.key] || "")}
            className="min-h-48 rounded-lg border bg-white p-3"
            onUpdate={(editor) => {
              if (editor) edit(field.key, JSON.stringify(editor.getJSON()));
            }}
          />
        </div>
      ) : (
        <textarea
          id={`content-${locale}-${field.key}`}
          className="min-h-20 w-full rounded-lg border p-3 text-sm"
          dir={LOCALES[locale as keyof typeof LOCALES]?.direction || "ltr"}
          disabled={busy === "save" || busy === "slug"}
          value={current[field.key] || ""}
          onChange={(e) => edit(field.key, e.target.value)}
          maxLength={
            /(?:meta|seo)Title$/.test(field.key)
              ? 70
              : /(?:meta|seo)Description$/.test(field.key)
                ? 170
                : field.key === "imageAlt"
                  ? 200
                  : 200000
          }
        />
      )}
      {locale !== "ar" && source[field.key] ? (
        <details className="text-xs text-slate-500">
          <summary>{dt("النص العربي")}</summary>
          <p className="whitespace-pre-wrap break-words pt-2">
            {previewText(source[field.key])}
          </p>
        </details>
      ) : null}
      {field.group === "seo" ? (
        <p dir="ltr" className="text-left text-xs text-slate-500">
          {(current[field.key] || "").length} /{" "}
          {/(?:meta|seo)Title$/.test(field.key)
            ? 70
            : /(?:meta|seo)Description$/.test(field.key)
              ? 170
              : 200}
        </p>
      ) : null}
      {status.missing.includes(field.key) ? (
        <p className="text-xs text-amber-700">
          {dt("هذا الحقل مطلوب لاكتمال الترجمة")}
        </p>
      ) : null}
    </section>
  );
  return (
    <div
      dir={dashDir()}
      className="mx-auto max-w-[1500px] space-y-6 pb-12 text-slate-800"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="text-sm text-slate-500" href={`/dashboard/${kind}`}>
            {dt(CONFIG[kind].label)}
          </Link>
          <h1 className="mt-2 text-2xl font-bold">
            {current.title || current.name || document.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>{dirty ? dt("تعديلات غير محفوظة") : dt("محفوظ")}</span>
            <span>
              {done} / {SUPPORTED_LOCALES.length - 1} {dt("ترجمات مكتملة")}
            </span>
            <span>{SUPPORTED_LOCALES.length - 1 - done} {dt("تحتاج ترجمة")}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button + " flex items-center gap-2 bg-white"}
            onClick={() => setLanguageReview(true)}
          >
            <Globe2 size={16} />
            {dt("اللغات والمراجعة")}
          </button>
          <button
            type="button"
            className={button + " flex items-center gap-2"}
            disabled={!dirty || Boolean(busy) || uploads > 0}
            onClick={resetDraft}
          >
            <Undo2 size={16} />
            {dt("التراجع")}
          </button>
          <Link
            className={button + " flex items-center gap-2"}
            href={`/dashboard/${kind}`}
          >
            <ArrowRight size={16} />
            {dt("العودة")}
          </Link>
          <button
            type="button"
            className={button + " flex items-center gap-2 bg-white"}
            onClick={() => setPreviewOpen(true)}
          >
            <Eye size={16} />
            {kind === "campaigns" ? dt("معاينة المشروع") : dt("معاينة الصفحة")}
          </button>
          <button
            type="button"
            className={
              button +
              " flex items-center gap-2 bg-brand text-white hover:bg-brand-dark"
            }
            disabled={Boolean(busy) || uploads > 0}
            onClick={save}
          >
            <Save size={16} />
            {uploads
              ? dt("جار رفع الصور…")
              : busy === "save"
                ? dt("جار الحفظ…")
                : dt("حفظ التغييرات")}
          </button>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
        <button
          type="button"
          className={button}
          disabled={Boolean(busy) || uploads > 0}
          onClick={() => {
            if (
              !dirty ||
              window.confirm(dt("تحميل النسخة المحفوظة وإلغاء تعديلات المسودة؟"))
            )
              void initialLoad();
          }}
        >
          {dt("تحميل النسخة المحفوظة")}
        </button>
        <button
          type="button"
          className={button}
          disabled={Boolean(busy) || locale === "ar" || dirty}
          onClick={() => suggest("translate")}
        >
          {dt("ترجمة الحقول المحددة")}
        </button>
        <button
          type="button"
          className={button}
          disabled={Boolean(busy) || dirty}
          onClick={() => suggest("translate", true)}
        >
          {dt("ترجمة اللغات الناقصة")}
        </button>
        <button
          type="button"
          className={button}
          disabled={Boolean(busy) || dirty}
          onClick={() => suggest("seo")}
        >
          {isBanner ? dt("اقتراح وصف الصورة") : dt("اقتراح SEO")}
        </button>
        {!isBanner ? <>
          <button type="button" className={button} disabled={Boolean(busy) || dirty} onClick={() => suggest("seo", true)}>
            {dt("اقتراح SEO لكل اللغات")}
          </button>
          <button type="button" className={button} disabled={Boolean(busy) || dirty} onClick={() => suggest("faq")}>
            {dt("اقتراح أسئلة لهذه اللغة")}
          </button>
        </> : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          {dt("راجعت نص هذه اللغة")}
        </label>
        {busy && busy !== "save" ? (
          <span role="status" className="text-sm">
            {dt("جار إعداد")}{" "}
            {busy === "seo"
              ? dt("الاقتراح")
              : busy === "slug"
                ? dt("الرابط")
                : dt("الترجمة")}
            …
          </span>
        ) : null}
      </div>
      {generationProgress ? <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border bg-sky-50 p-4">
        <span>{dt("اكتمل {0} من {1} لغة", [generationProgress.done, generationProgress.total])}</span>
        <progress max={generationProgress.total} value={generationProgress.done} aria-label={dt("تقدم الاقتراحات")} />
        <button type="button" className={button} onClick={() => generationAbort.current?.abort()}>{dt("إيقاف الطلب")}</button>
      </div> : null}
      {message ? (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
        >
          {message}
        </p>
      ) : null}
      {proposal ? (
        <section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex justify-between">
            <h2 className="font-bold">{dt("مراجعة الاقتراحات")}</h2>
            <button type="button" className={button} onClick={() => {
              for (const [target, item] of Object.entries(proposal.proposals))
                for (const [key, value] of Object.entries(item.values)) apply(target, key, value);
            }}>{dt("تطبيق جميع الاقتراحات على المسودة")}</button>
            <button
              type="button"
              className={button}
              onClick={() => setProposal(null)}
            >
              {dt("إغلاق")}
            </button>
          </div>
          {Object.entries(proposal.errors).map(([code, error]) => (
            <p role="alert" key={code}>
              {code}: {error}
            </p>
          ))}
          {Object.entries(proposal.proposals).map(([code, item]) => (
            <div key={code} className="space-y-3">
              <h3 className="font-semibold">
                {LOCALES[code as keyof typeof LOCALES]?.nativeLabel || code}
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    for (const [key, value] of Object.entries(item.values))
                      if (!(values[code]?.[key] || "").trim())
                        apply(code, key, value);
                  }}
                >
                  {dt("ملء الحقول الفارغة في المسودة")}
                </button>
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    if (
                      window.confirm(
                        dt("استبدال حقول هذه اللغة بالاقتراحات المعروضة في المسودة؟"),
                      )
                    )
                      for (const [key, value] of Object.entries(item.values))
                        apply(code, key, value);
                  }}
                >
                  {dt("استخدام اقتراحات هذه اللغة")}
                </button>
              </div>
              {item.research ? <aside className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <b>{dt("أساس البحث ومصادره")}</b>
                <p>{item.research.summary}</p>
                <ul>{item.research.sources.map((source) => <li key={source.url}><a className="text-blue-700 underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul>
              </aside> : null}
              {item.warnings.map((warning, i) => (
                <p key={i} className="text-amber-800 text-sm">
                  {warning}
                </p>
              ))}
              {Object.entries(item.values).map(([key, value]) => (
                <article key={key} className="rounded-lg border bg-white p-3">
                  <b className="text-sm">
                    {document.fields.find((f) => f.key === key)?.label || key}
                  </b>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <div className="whitespace-pre-wrap break-words text-sm text-slate-500">
                      {previewText(values[code]?.[key] || dt("فارغ"))}
                    </div>
                    <div dir={LOCALES[code as keyof typeof LOCALES]?.direction || "ltr"} className="space-y-3">
                      {key === "faqContent" ? readFaqDraft(value).map((question, index, questions) => (
                        <fieldset key={index} className="space-y-2 rounded border p-3">
                          <input aria-label={dt("السؤال {0}", [index + 1])} className="w-full rounded border p-2" value={question.q} onChange={(event) =>
                            reviseProposal(code, key, JSON.stringify(questions.map((item, position) => position === index ? { ...item, q: event.target.value } : item)))
                          } />
                          <textarea aria-label={dt("الإجابة {0}", [index + 1])} className="w-full rounded border p-2" rows={3} value={question.a} onChange={(event) =>
                            reviseProposal(code, key, JSON.stringify(questions.map((item, position) => position === index ? { ...item, a: event.target.value } : item)))
                          } />
                        </fieldset>
                      )) : document.fields.find((field) => field.key === key)?.rich ? (
                        <RichEditor defaultValue={parseRich(value)} onUpdate={(editor) => { if (editor) reviseProposal(code, key, JSON.stringify(editor.getJSON())); }}
                          className="rounded border bg-white [&_.ProseMirror]:min-h-40 [&_.ProseMirror]:p-3" />
                      ) : (
                        <textarea aria-label={dt("الاقتراح: {0}", [key])} className="w-full rounded border bg-white p-3" rows={4} value={value} onChange={(event) => reviseProposal(code, key, event.target.value)} />
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={button + " mt-3"}
                    onClick={() => apply(code, key, value)}
                  >
                    {dt("استخدام في المسودة")}
                  </button>
                </article>
              ))}
            </div>
          ))}
        </section>
      ) : null}
      <div
        inert={busy === "save" || busy === "slug"}
        className="grid items-start gap-5 xl:grid-cols-[190px_minmax(0,1fr)_280px]"
      >
        <nav
          aria-label={dt("أقسام المحرر")}
          className="flex gap-1 overflow-x-auto rounded-xl border bg-white p-2 xl:sticky xl:top-5 xl:flex-col xl:overflow-visible"
        >
          {EDITOR_SECTIONS[kind].map((item, index) => {
            const Icon = sectionIcons[item.icon as keyof typeof sectionIcons];
            return (
              <button
                key={item.id}
                type="button"
                aria-current={section === item.id ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-4 text-start text-sm ${section === item.id ? "bg-brand/5 font-bold text-brand" : "text-slate-500 hover:bg-slate-50"}`}
                onClick={() => setSection(item.id)}
              >
                <Icon size={17} />
                <span className="flex-1">{item.label}</span>
                <small className="text-[10px] opacity-50">
                  {String(index + 1).padStart(2, "0")}
                </small>
              </button>
            );
          })}
          <p className="hidden px-3 py-5 text-xs leading-6 text-slate-400 xl:block">
            {dt("كل الأقسام تخص العنصر نفسه. راجع التغييرات ثم احفظها من الشريط العلوي.")}
          </p>
        </nav>
        <div className="min-w-0 space-y-5">
          <h2 className="text-lg font-bold">
            {EDITOR_SECTIONS[kind].find((s) => s.id === section)?.label}{" "}
            <small className="font-normal text-slate-400">
              · {LOCALES[locale as keyof typeof LOCALES]?.nativeLabel}
            </small>
          </h2>
          {["content", "seo", "page", "layout", "links", "media"].includes(
            section,
          )
            ? languageButtons
            : null}
          {catalogError ? (
            <p role="alert" className="text-sm text-red-700">
              {catalogError}
            </p>
          ) : null}
          {kind === "super-categories" &&
          section === "content" &&
          Boolean(document.settings.verseArabic) ? (
            <section className="rounded-xl border bg-amber-50 p-5">
              <h3 className="text-sm font-semibold">
                {dt("النص العربي المحفوظ · للقراءة فقط")}
              </h3>
              <p lang="ar" dir={dashDir()} className="mt-4 text-xl leading-10">
                {String(document.settings.verseArabic)}
              </p>
              <p className="mt-3 text-xs text-slate-500">
                {dt("لا يُرسل إلى خدمة الترجمة ولا تغيّره تعديلات الصفحة.")}
              </p>
            </section>
          ) : null}
          {["content", "page", "layout", "links", "media"].includes(section) ? (
            <>
              {document.fields
                .filter((f) => {
                  if (section === "media")
                    return f.key === "imageAlt" || f.key === "videoUrl";
                  if (f.group !== "content" || f.key === "videoUrl")
                    return false;
                  if (section === "layout")
                    return (
                      f.key.startsWith("blocks.") &&
                      Array.isArray(settingsDraft.blocks) &&
                      settingsDraft.blocks.some((b: ContentRecord) =>
                        f.key.startsWith(`blocks.${b.id}.`),
                      )
                    );
                  if (section === "links")
                    return kind === "urgent-banners" && f.key.startsWith("cta");
                  if (section === "page")
                    return (
                      kind === "categories" &&
                      !["name", "description"].includes(f.key)
                    );
                  if (kind === "urgent-banners")
                    return !f.key.startsWith("cta") && f.key !== "amountLabels";
                  if (kind === "categories")
                    return ["name", "description"].includes(f.key);
                  return !f.key.startsWith("blocks.");
                })
                .map(renderField)}
              {kind === "urgent-banners" && section === "media"
                ? document.fields
                    .filter((f) => f.key === "amountLabels")
                    .map(renderField)
                : null}
            </>
          ) : null}
          <WorkspaceSettings
            onUploadingChange={onUploadingChange}
            kind={kind}
            section={section}
            settings={{ ...settingsDraft, id }}
            onChange={setSetting}
            catalog={catalog}
          />
          {kind === "super-categories" ? (
            <ProgrammeWorkspace
              section={section}
              settings={settingsDraft}
              onChange={setSetting}
              catalog={catalog}
              locale={locale}
            />
          ) : null}
          {kind === "categories" && section === "library" ? (
            <section className="space-y-4 rounded-xl border bg-white p-5">
              <h3 className="font-bold">{dt("المشاريع المرتبطة بهذا التصنيف")}</h3>
              <button
                type="button"
                className={button}
                disabled={dirty}
                onClick={() => setCategoryOrderOpen(true)}
              >
                {dt("ترتيب المشاريع داخل التصنيف")}
              </button>
              <p className="text-xs text-slate-500">
                {dt("ترتيب التصنيف مستقل عن الترتيب العام؛ يُحفظ من نافذة الترتيب نفسها.")}
              </p>
              <p className="text-sm text-slate-500">
                {dt("تعديل عضوية المشروع متاح من محرر المشروع، دون حذف بيانات التبرعات.")}
              </p>
              {catalog.campaigns
                .filter((c) => c.categoryIds?.includes(id))
                .sort((a, b) => (a.priority || 0) - (b.priority || 0))
                .map((c) => (
                  <Link
                    key={c.id}
                    href={`/dashboard/campaigns/edit/${c.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  >
                    <span>{c.title}</span>
                    <span className="text-brand">{dt("تحرير المشروع ←")}</span>
                  </Link>
                ))}
            </section>
          ) : null}
          {section === "seo" ? (
            <SeoWorkspace
              onUploadingChange={onUploadingChange}
              values={current}
              fields={document.fields}
              renderField={renderField}
              onChange={edit}
              locale={locale}
            />
          ) : null}
          {section === "donation" ? (
            <section className="rounded-xl border bg-white p-5">
              <h3 className="font-bold">{dt("المبلغ المحصّل")}</h3>
              <p className="my-3 text-2xl font-bold" dir="ltr">
                $
                {Number(document.settings.currentAmount || 0).toLocaleString(
                  "en-US",
                )}
              </p>
              <p className="text-sm leading-7 text-slate-500">
                {dt("للعرض فقط؛ يُحتسب من سجل التبرعات. تعديل المحتوى أو الهدف لا يغيّر المبلغ المحصّل.")}
              </p>
            </section>
          ) : null}
          {(kind === "campaigns" &&
            ["donation", "history"].includes(section)) ||
          (kind === "categories" && section === "page") || (["videos", "playlists", "courses", "reports", "booklets", "faqs"].includes(kind) && section === "review") ? (
            <details className="rounded-xl border bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                {dt("الأدوات المتخصصة والإعدادات المتقدمة")}
              </summary>
              <p className="my-3 text-xs leading-6 text-slate-500">
                {dt("تخصيصات العملات، وإدارة الإنجازات والبطاقات التفصيلية متاحة في الأدوات الأصلية. احفظ مسودة المحرر أولًا قبل الانتقال.")}
              </p>
              <Link
                className={button + " inline-block"}
                href={`/dashboard/${kind}/settings/${id}`}
              >
                {dt("فتح الإعدادات المتقدمة")}
              </Link>
            </details>
          ) : null}
          {section === "history" ? (
            <section className="space-y-3 rounded-xl border bg-white p-5">
              <h3 className="font-bold">{dt("الإنجازات والتحديثات")}</h3>
              {Array.isArray(document.settings.updates) &&
              document.settings.updates.length ? (
                document.settings.updates.map((item: ContentRecord) => (
                  <article key={String(item.id)} className="rounded border p-4">
                    <h4 className="font-bold">
                      {String(item.title || dt("تحديث المشروع"))}
                    </h4>
                    <p className="mt-2 text-sm">
                      {previewText(String(item.description || ""))}
                    </p>
                    <time className="text-xs text-slate-400">
                      {String(item.createdAt || "")}
                    </time>
                  </article>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  {dt("لا توجد تحديثات منشورة لهذا المشروع.")}
                </p>
              )}
            </section>
          ) : null}
          {section === "review" ? (
            <section className="space-y-4 rounded-xl border bg-white p-5">
              <h3 className="font-bold">{dt("المراجعة قبل النشر")}</h3>
              {document.fields
                .filter((f) => f.required)
                .map((f) => (
                  <p key={f.key} className="flex justify-between border-b pb-3">
                    <span>{f.label}</span>
                    <span
                      className={
                        current[f.key] ? "text-emerald-700" : "text-amber-700"
                      }
                    >
                      {current[f.key] ? dt("موجود") : dt("ناقص")}
                    </span>
                  </p>
                ))}
              <button
                type="button"
                className={button}
                onClick={() => setLanguageReview(true)}
              >
                {dt("مراجعة جميع اللغات")}
              </button>
              <button
                type="button"
                className={button}
                onClick={() => setPreviewOpen(true)}
              >
                {dt("معاينة قبل الحفظ")}
              </button>
            </section>
          ) : null}
          <section className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold">{dt("حالة اللغة")}</h3>
            <p className="mt-2 text-sm">
              {status.complete
                ? dt("المحتوى مكتمل")
                : `حقول ناقصة: ${status.missing.length}`}{" "}
              ·{" "}
              {status.seoComplete
                ? dt("إعدادات البحث مكتملة")
                : dt("إعدادات البحث تحتاج استكمالًا")}
            </p>
          </section>
          {["campaigns", "categories", "blog"].includes(kind) && section === "links" ? (
            <section className="space-y-3 rounded-xl border bg-white p-4">
              <h3 className="font-semibold">{dt("الرابط وسجل التغييرات")}</h3>
              <p dir="ltr" className="break-all text-sm">
                /{locale}/{kind === "categories" ? "category" : slugFor(kind === "blog" ? "article" : "projectDetail", locale)}/{document.slugs[locale]}
              </p>
              <button
                type="button"
                className={button}
                disabled={Boolean(busy) || dirty}
                onClick={() => {
                  setSlug(document.slugs[locale]);
                  setConfirmation("");
                  setSlugOpen(true);
                }}
              >
                {dt("تعديل الرابط")}
              </button>
              <button type="button" className={button} disabled={Boolean(busy) || dirty} onClick={() => {
                setSlug(slugify(current[kind === "categories" ? "name" : "title"] || ""));
                setConfirmation(""); setSlugOpen(true);
              }}>{dt("توليد الرابط من العنوان")}</button>
              {document.previousSlugs
                .filter((entry) => (entry.locale || "ar") === locale)
                .map((entry, i) => (
                  <div className="rounded-lg border p-2 text-xs" key={i}>
                    <p dir="ltr">
                      {String(entry.from)} → {String(entry.to)}
                    </p>
                    <p>{String(entry.at)}</p>
                    <button
                      type="button"
                      className={button}
                      onClick={() => {
                        setSlug(String(entry.from));
                        setConfirmation("");
                        setSlugOpen(true);
                      }}
                    >
                      {dt("استعادة الرابط السابق")}
                    </button>
                  </div>
                ))}
            </section>
          ) : null}
        </div>
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-5">
          <WorkspacePreview
            kind={kind}
            values={current}
            source={source}
            settings={liveSettings}
            locale={locale}
          />
          <button
            type="button"
            className={button + " w-full bg-white"}
            onClick={() => setPreviewOpen(true)}
          >
            {dt("عرض الصفحة كاملة")}
          </button>
        </aside>
      </div>
      {languageReview ? (
        <EditorModal
          title={dt("اللغات والمراجعة")}
          onClose={() => setLanguageReview(false)}
        >
          <section className="max-h-[85vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="language-review-heading" className="text-xl font-bold">
                {dt("اللغات والمراجعة")}
              </h2>
              <button
                type="button"
                className={button}
                onClick={() => setLanguageReview(false)}
              >
                {dt("إغلاق")}
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              {dt("النص البديل عند غياب الترجمة لا يُحسب ترجمة محفوظة.")}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start">
                  <th className="p-3 text-start">{dt("اللغة")}</th>
                  <th>{dt("المحتوى")}</th>
                  <th>{dt("البحث والمشاركة")}</th>
                  <th>{dt("المراجعة")}</th>
                  <th>{dt("التعديل")}</th>
                </tr>
              </thead>
              <tbody>
                {SUPPORTED_LOCALES.map((code) => {
                  const s = document.statuses[code];
                  return (
                    <tr key={code} className="border-b">
                      <td className="p-3">{LOCALES[code].nativeLabel}</td>
                      <td className="text-center">
                        {s.complete ? dt("مكتمل") : dt("ناقص")}
                      </td>
                      <td className="text-center">
                        {s.seoComplete ? dt("متاح") : dt("غير مكتمل")}
                      </td>
                      <td className="text-center">
                        {s.reviewed ? dt("مراجع") : dt("مسودة")}
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          className="p-2 text-brand"
                          onClick={() => {
                            setLocale(code);
                            setSection("content");
                            setLanguageReview(false);
                          }}
                        >
                          {dt("النص")}
                        </button>
                        {!isBanner ? (
                          <button
                            type="button"
                            className="p-2 text-brand"
                            onClick={() => {
                              setLocale(code);
                              setSection("seo");
                              setLanguageReview(false);
                            }}
                          >
                            SEO
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </EditorModal>
      ) : null}
      {previewOpen ? (
        <EditorModal
          title={dt("معاينة الصفحة")}
          onClose={() => setPreviewOpen(false)}
        >
          <section className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-slate-50 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="content-preview-heading" className="text-xl font-bold">
                {dt("معاينة الصفحة")}
              </h2>
              <button
                type="button"
                className={button}
                onClick={() => setPreviewOpen(false)}
              >
                {dt("إغلاق")}
              </button>
            </div>
            <WorkspacePreview
              kind={kind}
              values={current}
              source={source}
              settings={liveSettings}
              locale={locale}
              expanded
            />
          </section>
        </EditorModal>
      ) : null}
      {categoryOrderOpen && kind === "categories" ? (
        <CategoryOrderDialog
          open
          onOpenChange={setCategoryOrderOpen}
          categoryId={id}
          categoryName={document.title}
        />
      ) : null}
      {slugOpen ? (
        <EditorModal
          title={dt("مراجعة تغيير الرابط")}
          onClose={() => setSlugOpen(false)}
        >
          <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6">
            <h2 id="slug-heading" className="text-xl font-bold">
              {dt("مراجعة تغيير الرابط")}
            </h2>
            <p className="text-sm">
              {dt("الرابط الحالي:")} <span dir="ltr">{document.slugs[locale]}</span>{dt(". ستبقى الروابط السابقة محوّلة مباشرة إلى الرابط المعتمد.")}
            </p>
            <label className="block space-y-2">
              <span>{dt("الرابط الجديد")}</span>
              <input
                autoFocus
                dir="ltr"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setConfirmation("");
                }}
                className="w-full rounded border p-2"
              />
            </label>
            <label className="block space-y-2">
              <span>{dt("اكتب الرابط الجديد مرة أخرى للتأكيد")}</span>
              <input
                dir="ltr"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className="w-full rounded border p-2"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className={button}
                disabled={Boolean(busy) || !slug || slug !== confirmation}
                onClick={changeSlug}
              >
                {dt("حفظ الرابط")}
              </button>
              <button
                type="button"
                className={button}
                onClick={() => setSlugOpen(false)}
              >
                {dt("إلغاء")}
              </button>
            </div>
          </div>
        </EditorModal>
      ) : null}
    </div>
  );
}
