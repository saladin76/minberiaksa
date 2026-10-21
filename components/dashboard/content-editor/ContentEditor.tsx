"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  { ssr: false, loading: () => <p>تحميل المحرر…</p> },
);
type Document = ReturnType<typeof documentFor>;
type Proposal = {
  id: string;
  kind: ContentKind;
  revision: string;
  action: string;
  proposals: Record<string, { values: TextValues; warnings: string[] }>;
  errors: Record<string, string>;
};
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "تعذر إكمال الطلب");
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
        setMessage(error instanceof Error ? error.message : "تعذر التحميل");
    }
  }, [url, kind]);
  const invalidateRequests = useCallback(() => {
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
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const navigation = (e: MouseEvent) => {
      const link = (e.target as Element).closest?.("a[href]");
      if (link && !window.confirm("توجد تعديلات غير محفوظة. مغادرة المحرر؟")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    window.document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.document.removeEventListener("click", navigation, true);
    };
  }, [dirty]);
  const edit = (key: string, value: string) => {
    if (busy === "save" || busy === "slug") return;
    setValues((prev) => ({
      ...prev,
      [locale]: { ...prev[locale], [key]: value },
    }));
    setProposal(null);
    setReviewed(false);
  };
  const save = async () => {
    if (!document) return;
    if (uploads) {
      setMessage("انتظر اكتمال رفع الصور قبل الحفظ");
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
          "تغيرت النسخة بعد الحفظ. احتفظ بتعديلاتك ثم أعد تحميلها للمراجعة.",
        );
      setDocument(read);
      setValues(read.values);
      setSettingsDraft(settingsFor(kind, read.settings));
      setProposal(null);
      setReviewed(false);
      setMessage("تم الحفظ والتحقق من النسخة المحفوظة");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "تعذر تأكيد الحفظ. احتفظ بتعديلاتك وأعد المحاولة.",
      );
    } finally {
      setBusy("");
    }
  };
  const suggest = async (action: "seo" | "translate", all = false) => {
    if (!document || dirty) {
      setMessage("احفظ التعديلات أولًا لطلب اقتراح مرتبط بالنسخة الحالية");
      return;
    }
    const snapshot = JSON.stringify(valuesRef.current),
      revision = document.revision;
    setBusy(action);
    setMessage("");
    setProposal(null);
    try {
      const targets = all
        ? SUPPORTED_LOCALES.filter(
            (l) => l !== "ar" && !document.statuses[l].complete,
          )
        : [locale];
      if (action === "translate" && (targets.includes("ar") || !targets.length))
        throw new Error("اختر لغة أخرى أو لغة تحتاج ترجمة");
      const result = await api<Proposal>(url + "/suggest", {
        method: "POST",
        body: JSON.stringify({
          action,
          locale,
          locales: targets,
          keys: selected,
          revision,
        }),
      });
      if (snapshot !== JSON.stringify(valuesRef.current))
        throw new Error("تغير النص أثناء الطلب. اطلب اقتراحًا جديدًا.");
      if (
        result.id !== id ||
        result.kind !== kind ||
        result.revision !== revision
      )
        throw new Error("الاقتراح لا يطابق المحتوى الجاري تحريره");
      setProposal(result);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "تعذر إعداد الاقتراح",
      );
    } finally {
      setBusy("");
    }
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
    setProposal((prev) => {
      if (!prev) return null;
      const pending = { ...prev.proposals[target].values };
      delete pending[key];
      return {
        ...prev,
        proposals: {
          ...prev.proposals,
          [target]: { ...prev.proposals[target], values: pending },
        },
      };
    });
    setMessage("أضيف الاقتراح إلى المسودة. احفظ اللغة بعد المراجعة.");
  };
  const changeSlug = async () => {
    if (!document || dirty) {
      setMessage("احفظ تعديلات المحتوى قبل تغيير الرابط");
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
      setMessage("تم تغيير الرابط وحفظ الرابط السابق في السجل");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تغيير الرابط");
    } finally {
      setBusy("");
    }
  };
  if (!document)
    return (
      <div dir="rtl" className="rounded-xl border p-6" role="status">
        {message || "تحميل المحتوى…"}
        <button type="button" className={button} onClick={initialLoad}>
          إعادة المحاولة
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
    if (!dirty || window.confirm("التراجع عن كل التعديلات غير المحفوظة؟")) {
      setValues(document.values);
      setSettingsDraft(settingsFor(kind, document.settings));
      setProposal(null);
      setReviewed(false);
    }
  };
  const languageButtons = (
    <nav
      aria-label="لغات المحتوى"
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
          {field.label}
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
            ترجمة
          </label>
        ) : (
          <span className="text-xs text-slate-500">مراجعة يدوية</span>
        )}
      </div>
      {field.rich ? (
        <div
          id={`content-${locale}-${field.key}`}
          aria-label={field.label}
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
          <summary>النص العربي</summary>
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
          هذا الحقل مطلوب لاكتمال الترجمة
        </p>
      ) : null}
    </section>
  );
  return (
    <div
      dir="rtl"
      className="mx-auto max-w-[1500px] space-y-6 pb-12 text-slate-800"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="text-sm text-slate-500" href={`/dashboard/${kind}`}>
            {CONFIG[kind].label}
          </Link>
          <h1 className="mt-2 text-2xl font-bold">
            {current.title || current.name || document.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>{dirty ? "تعديلات غير محفوظة" : "محفوظ"}</span>
            <span>
              {done} / {SUPPORTED_LOCALES.length - 1} ترجمات مكتملة
            </span>
            <span>{SUPPORTED_LOCALES.length - 1 - done} تحتاج ترجمة</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button + " flex items-center gap-2 bg-white"}
            onClick={() => setLanguageReview(true)}
          >
            <Globe2 size={16} />
            اللغات والمراجعة
          </button>
          <button
            type="button"
            className={button + " flex items-center gap-2"}
            disabled={!dirty || Boolean(busy) || uploads > 0}
            onClick={resetDraft}
          >
            <Undo2 size={16} />
            التراجع
          </button>
          <Link
            className={button + " flex items-center gap-2"}
            href={`/dashboard/${kind}`}
          >
            <ArrowRight size={16} />
            العودة
          </Link>
          <button
            type="button"
            className={button + " flex items-center gap-2 bg-white"}
            onClick={() => setPreviewOpen(true)}
          >
            <Eye size={16} />
            {kind === "campaigns" ? "معاينة المشروع" : "معاينة الصفحة"}
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
              ? "جار رفع الصور…"
              : busy === "save"
                ? "جار الحفظ…"
                : "حفظ التغييرات"}
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
              window.confirm("تحميل النسخة المحفوظة وإلغاء تعديلات المسودة؟")
            )
              void initialLoad();
          }}
        >
          تحميل النسخة المحفوظة
        </button>
        <button
          type="button"
          className={button}
          disabled={Boolean(busy) || locale === "ar" || dirty}
          onClick={() => suggest("translate")}
        >
          ترجمة الحقول المحددة
        </button>
        <button
          type="button"
          className={button}
          disabled={Boolean(busy) || dirty}
          onClick={() => suggest("translate", true)}
        >
          ترجمة اللغات الناقصة
        </button>
        <button
          type="button"
          className={button}
          disabled={Boolean(busy) || dirty}
          onClick={() => suggest("seo")}
        >
          {isBanner ? "اقتراح وصف الصورة" : "اقتراح SEO"}
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          راجعت نص هذه اللغة
        </label>
        {busy && busy !== "save" ? (
          <span role="status" className="text-sm">
            جار إعداد{" "}
            {busy === "seo"
              ? "الاقتراح"
              : busy === "slug"
                ? "الرابط"
                : "الترجمة"}
            …
          </span>
        ) : null}
      </div>
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
            <h2 className="font-bold">مراجعة الاقتراحات</h2>
            <button
              type="button"
              className={button}
              onClick={() => setProposal(null)}
            >
              إغلاق
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
                  ملء الحقول الفارغة في المسودة
                </button>
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    if (
                      window.confirm(
                        "استبدال حقول هذه اللغة بالاقتراحات المعروضة في المسودة؟",
                      )
                    )
                      for (const [key, value] of Object.entries(item.values))
                        apply(code, key, value);
                  }}
                >
                  استخدام اقتراحات هذه اللغة
                </button>
              </div>
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
                      {previewText(values[code]?.[key] || "فارغ")}
                    </div>
                    <div
                      dir="auto"
                      className="whitespace-pre-wrap break-words text-sm"
                    >
                      {previewText(value)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={button + " mt-3"}
                    onClick={() => apply(code, key, value)}
                  >
                    استخدام في المسودة
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
          aria-label="أقسام المحرر"
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
            كل الأقسام تخص العنصر نفسه. راجع التغييرات ثم احفظها من الشريط
            العلوي.
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
                النص العربي المحفوظ · للقراءة فقط
              </h3>
              <p lang="ar" dir="rtl" className="mt-4 text-xl leading-10">
                {String(document.settings.verseArabic)}
              </p>
              <p className="mt-3 text-xs text-slate-500">
                لا يُرسل إلى خدمة الترجمة ولا تغيّره تعديلات الصفحة.
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
              <h3 className="font-bold">المشاريع المرتبطة بهذا التصنيف</h3>
              <button
                type="button"
                className={button}
                disabled={dirty}
                onClick={() => setCategoryOrderOpen(true)}
              >
                ترتيب المشاريع داخل التصنيف
              </button>
              <p className="text-xs text-slate-500">
                ترتيب التصنيف مستقل عن الترتيب العام؛ يُحفظ من نافذة الترتيب
                نفسها.
              </p>
              <p className="text-sm text-slate-500">
                تعديل عضوية المشروع متاح من محرر المشروع، دون حذف بيانات
                التبرعات.
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
                    <span className="text-brand">تحرير المشروع ←</span>
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
              <h3 className="font-bold">المبلغ المحصّل</h3>
              <p className="my-3 text-2xl font-bold" dir="ltr">
                $
                {Number(document.settings.currentAmount || 0).toLocaleString(
                  "en-US",
                )}
              </p>
              <p className="text-sm leading-7 text-slate-500">
                للعرض فقط؛ يُحتسب من سجل التبرعات. تعديل المحتوى أو الهدف لا
                يغيّر المبلغ المحصّل.
              </p>
            </section>
          ) : null}
          {(kind === "campaigns" &&
            ["donation", "history"].includes(section)) ||
          (kind === "categories" && section === "page") ? (
            <details className="rounded-xl border bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                الأدوات المتخصصة والإعدادات المتقدمة
              </summary>
              <p className="my-3 text-xs leading-6 text-slate-500">
                تخصيصات العملات، وإدارة الإنجازات والبطاقات التفصيلية متاحة في
                الأدوات الأصلية. احفظ مسودة المحرر أولًا قبل الانتقال.
              </p>
              <Link
                className={button + " inline-block"}
                href={`/dashboard/${kind}/settings/${id}`}
              >
                فتح الإعدادات المتقدمة
              </Link>
            </details>
          ) : null}
          {section === "history" ? (
            <section className="space-y-3 rounded-xl border bg-white p-5">
              <h3 className="font-bold">الإنجازات والتحديثات</h3>
              {Array.isArray(document.settings.updates) &&
              document.settings.updates.length ? (
                document.settings.updates.map((item: ContentRecord) => (
                  <article key={String(item.id)} className="rounded border p-4">
                    <h4 className="font-bold">
                      {String(item.title || "تحديث المشروع")}
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
                  لا توجد تحديثات منشورة لهذا المشروع.
                </p>
              )}
            </section>
          ) : null}
          {section === "review" ? (
            <section className="space-y-4 rounded-xl border bg-white p-5">
              <h3 className="font-bold">المراجعة قبل النشر</h3>
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
                      {current[f.key] ? "موجود" : "ناقص"}
                    </span>
                  </p>
                ))}
              <button
                type="button"
                className={button}
                onClick={() => setLanguageReview(true)}
              >
                مراجعة جميع اللغات
              </button>
              <button
                type="button"
                className={button}
                onClick={() => setPreviewOpen(true)}
              >
                معاينة قبل الحفظ
              </button>
            </section>
          ) : null}
          <section className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold">حالة اللغة</h3>
            <p className="mt-2 text-sm">
              {status.complete
                ? "المحتوى مكتمل"
                : `حقول ناقصة: ${status.missing.length}`}{" "}
              ·{" "}
              {status.seoComplete
                ? "إعدادات البحث مكتملة"
                : "إعدادات البحث تحتاج استكمالًا"}
            </p>
          </section>
          {kind === "categories" && section === "links" ? (
            <section className="space-y-3 rounded-xl border bg-white p-4">
              <h3 className="font-semibold">الرابط وسجل التغييرات</h3>
              <p dir="ltr" className="break-all text-sm">
                /{locale}/category/{document.slugs[locale]}
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
                تعديل الرابط
              </button>
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
                      استعادة الرابط السابق
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
            عرض الصفحة كاملة
          </button>
        </aside>
      </div>
      {languageReview ? (
        <EditorModal
          title="اللغات والمراجعة"
          onClose={() => setLanguageReview(false)}
        >
          <section className="max-h-[85vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="language-review-heading" className="text-xl font-bold">
                اللغات والمراجعة
              </h2>
              <button
                type="button"
                className={button}
                onClick={() => setLanguageReview(false)}
              >
                إغلاق
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              النص البديل عند غياب الترجمة لا يُحسب ترجمة محفوظة.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start">
                  <th className="p-3 text-start">اللغة</th>
                  <th>المحتوى</th>
                  <th>البحث والمشاركة</th>
                  <th>المراجعة</th>
                  <th>التعديل</th>
                </tr>
              </thead>
              <tbody>
                {SUPPORTED_LOCALES.map((code) => {
                  const s = document.statuses[code];
                  return (
                    <tr key={code} className="border-b">
                      <td className="p-3">{LOCALES[code].nativeLabel}</td>
                      <td className="text-center">
                        {s.complete ? "مكتمل" : "ناقص"}
                      </td>
                      <td className="text-center">
                        {s.seoComplete ? "متاح" : "غير مكتمل"}
                      </td>
                      <td className="text-center">
                        {s.reviewed ? "مراجع" : "مسودة"}
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
                          النص
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
          title="معاينة الصفحة"
          onClose={() => setPreviewOpen(false)}
        >
          <section className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-slate-50 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="content-preview-heading" className="text-xl font-bold">
                معاينة الصفحة
              </h2>
              <button
                type="button"
                className={button}
                onClick={() => setPreviewOpen(false)}
              >
                إغلاق
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
          title="مراجعة تغيير الرابط"
          onClose={() => setSlugOpen(false)}
        >
          <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6">
            <h2 id="slug-heading" className="text-xl font-bold">
              مراجعة تغيير الرابط
            </h2>
            <p className="text-sm">
              الرابط الحالي: <span dir="ltr">{document.slugs[locale]}</span>.
              ستبقى الروابط السابقة محوّلة مباشرة إلى الرابط المعتمد.
            </p>
            <label className="block space-y-2">
              <span>الرابط الجديد</span>
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
              <span>اكتب الرابط الجديد مرة أخرى للتأكيد</span>
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
                حفظ الرابط
              </button>
              <button
                type="button"
                className={button}
                onClick={() => setSlugOpen(false)}
              >
                إلغاء
              </button>
            </div>
          </div>
        </EditorModal>
      ) : null}
    </div>
  );
}
