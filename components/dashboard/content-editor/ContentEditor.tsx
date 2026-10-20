"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { BannerPreview } from "./BannerPreview";
import { LOCALES, SUPPORTED_LOCALES } from "@/lib/locales";
import {
  CONFIG,
  localeStatus,
  type ContentField,
  type ContentKind,
  type TextValues,
} from "@/lib/content-editor/contracts";
import type { documentFor } from "@/lib/content-editor/service";
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
      setSelected(data.fields.filter((f) => !f.locked).map((f) => f.key));
      setMessage("");
    } catch (error) {
      if (number === requestRef.current)
        setMessage(error instanceof Error ? error.message : "تعذر التحميل");
    }
  }, [url]);
  const invalidateRequests = useCallback(() => {
    requestRef.current++;
  }, []);
  useEffect(() => {
    void initialLoad();
    return invalidateRequests;
  }, [initialLoad, invalidateRequests]);
  const dirty = document
    ? JSON.stringify(values) !== JSON.stringify(document.values)
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
        }),
      });
      const read = await api<Document>(url);
      if (read.revision !== saved.revision)
        throw new Error(
          "تغيرت النسخة بعد الحفظ. احتفظ بتعديلاتك ثم أعد تحميلها للمراجعة.",
        );
      setDocument(read);
      setValues((prev) => ({ ...prev, [target]: read.values[target] }));
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
  const settingsHref =
    kind === "blog"
      ? `/dashboard/blog/settings/${id}`
      : `/dashboard/${kind}/settings/${id}`;
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
    <div dir="rtl" className="mx-auto max-w-7xl space-y-5 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="text-sm text-slate-500" href={`/dashboard/${kind}`}>
            {CONFIG[kind].label}
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{document.title}</h1>
        </div>
        <Link className={button} href={settingsHref}>
          إعدادات العنصر والوسائط
        </Link>
      </header>
      <div className="flex flex-wrap justify-between gap-4 rounded-xl border bg-white p-4">
        <span>
          الترجمات المحفوظة المكتملة: {done} / {SUPPORTED_LOCALES.length - 1}
        </span>
        <span>تحتاج ترجمة: {SUPPORTED_LOCALES.length - 1 - done}</span>
        <span>{dirty ? "تعديلات غير محفوظة" : "النسخة المحفوظة"}</span>
      </div>
      <nav aria-label="لغات المحتوى" className="flex flex-wrap gap-2">
        {SUPPORTED_LOCALES.map((code) => (
          <button
            type="button"
            key={code}
            disabled={busy === "save" || busy === "slug"}
            onClick={() => {
              setLocale(code);
              setReviewed(false);
            }}
            aria-pressed={locale === code}
            className={`${button} ${locale === code ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-white"}`}
          >
            {LOCALES[code].nativeLabel} ·{" "}
            {document.statuses[code].complete ? "مكتمل" : "ناقص"}
            {document.statuses[code].reviewed ? " · مراجع" : ""}
            {JSON.stringify(values[code]) !==
            JSON.stringify(document.values[code])
              ? " *"
              : ""}
          </button>
        ))}
      </nav>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 shadow-sm">
        <button
          type="button"
          className={button + " bg-brand text-white hover:bg-brand-dark"}
          disabled={Boolean(busy)}
          onClick={save}
        >
          {busy === "save" ? "جار الحفظ…" : "حفظ هذه اللغة"}
        </button>
        <button
          type="button"
          className={button}
          disabled={Boolean(busy)}
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
          disabled={Boolean(busy) || !dirty}
          onClick={() => {
            if (window.confirm("التراجع عن كل التعديلات غير المحفوظة؟")) {
              setValues(document.values);
              setProposal(null);
              setReviewed(false);
            }
          }}
        >
          التراجع
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
      <main
        inert={busy === "save" || busy === "slug"}
        className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
      >
        <div className="space-y-4">
          <h2 className="text-lg font-bold">
            المحتوى · {LOCALES[locale as keyof typeof LOCALES]?.nativeLabel}
          </h2>
          {document.fields
            .filter(
              (f) =>
                f.group === "content" &&
                [
                  "name",
                  "title",
                  "description",
                  "content",
                  "subtitle",
                  "intro",
                ].includes(f.key),
            )
            .map(renderField)}
          {document.fields.some(
            (f) =>
              f.group === "content" &&
              ![
                "name",
                "title",
                "description",
                "content",
                "subtitle",
                "intro",
              ].includes(f.key),
          ) ? (
            <details className="space-y-3 rounded-xl border p-4">
              <summary className="cursor-pointer font-semibold">
                {kind === "categories"
                  ? "نصوص صفحة التصنيف والبطاقات"
                  : kind === "super-categories"
                    ? "الأزرار وأقسام الصفحة والنص الديني"
                    : "الأزرار وتسميات المبالغ"}
              </summary>
              <div className="mt-4 space-y-4">
                {document.fields
                  .filter(
                    (f) =>
                      f.group === "content" &&
                      ![
                        "name",
                        "title",
                        "description",
                        "content",
                        "subtitle",
                        "intro",
                      ].includes(f.key),
                  )
                  .map(renderField)}
              </div>
            </details>
          ) : null}
        </div>
        <aside className="space-y-4">
          {isBanner ? (
            <BannerPreview
              values={current}
              source={source}
              settings={document.settings}
              locale={locale}
            />
          ) : null}
          <h2 className="text-lg font-bold">
            {isBanner ? "الصورة وإمكانية الوصول" : "البحث والمشاركة"}
          </h2>
          {isBanner ? (
            <p className="text-sm text-slate-500">
              البانر جزء من الصفحة التي يظهر فيها؛ وصفه لا ينشئ عنوان بحث
              مستقلًا.
            </p>
          ) : null}
          {document.fields.filter((f) => f.group === "seo").map(renderField)}
          {!isBanner ? (
            <section className="rounded-xl border bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold">معاينة البحث</h3>
              <p className="text-lg text-blue-800">
                {current.metaTitle ||
                  current.seoTitle ||
                  current.title ||
                  current.name}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {current.metaDescription ||
                  current.seoDescription ||
                  "أضف وصف البحث"}
              </p>
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
          {kind === "categories" ? (
            <section className="space-y-3 rounded-xl border bg-white p-4">
              <h3 className="font-semibold">الرابط وسجل التغييرات</h3>
              <p dir="ltr" className="break-all text-sm">
                /category/{document.slug}
              </p>
              <button
                type="button"
                className={button}
                disabled={Boolean(busy) || dirty}
                onClick={() => {
                  setSlug(document.slug);
                  setConfirmation("");
                  setSlugOpen(true);
                }}
              >
                تعديل الرابط
              </button>
              {document.previousSlugs.map((entry, i) => (
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
        </aside>
      </main>
      {slugOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="slug-heading"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6">
            <h2 id="slug-heading" className="text-xl font-bold">
              مراجعة تغيير الرابط
            </h2>
            <p className="text-sm">
              الرابط الحالي: <span dir="ltr">{document.slug}</span>. ستبقى
              الروابط السابقة محوّلة مباشرة إلى الرابط المعتمد.
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
        </div>
      ) : null}
    </div>
  );
}
