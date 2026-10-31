"use client";
import { clipSeoDescription } from "@/lib/seo-description";
import { dt } from "@/lib/dashboard/i18n";
import { useState, useEffect, type ReactNode } from "react";
import { contentFieldLimit, type ContentField, type TextValues } from "@/lib/content-editor/contracts";
import { ImageUploadField } from "@/app/(dashboard)/dashboard/_components/ImageUploadField";
type Faq = { q: string; a: string; structuredData?: boolean };
export function SeoWorkspace({
  values,
  fields,
  renderField,
  onChange,
  locale,
  onUploadingChange,
  focusField,
}: {
  focusField?: string;
  values: TextValues;
  fields: ContentField[];
  renderField: (field: ContentField) => ReactNode;
  onChange: (key: string, value: string) => void;
  locale: string;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [tab, setTab] = useState("search");
  useEffect(() => {
    if (focusField) setTab(focusField.startsWith("og") ? "share" : "search");
  }, [focusField]);
  useEffect(() => {
    if (!focusField) return;
    const frame = requestAnimationFrame(() => {
      const field = document.getElementById(`content-${locale}-${focusField}`);
      field?.scrollIntoView({ block: "center", behavior: "smooth" }); field?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusField, locale, tab]);
  let faq: Faq[] = [];
  try {
    faq = JSON.parse(values.faqContent || "[]");
  } catch {
    /* show a recoverable empty draft */
  }
  const title =
      values.seoTitle || values.metaTitle || values.title || values.name || "",
    description = values.seoDescription || values.metaDescription || "";
  const publishedDescription = clipSeoDescription(description, locale);
  const descriptionLimit = locale === "ja" || locale === "zh" ? 90 : 160;
  const writeFaq = (next: Faq[]) =>
    onChange("faqContent", JSON.stringify(next));
  const checks = [
    [dt("عنوان البحث"), Boolean(values.seoTitle || values.metaTitle)],
    [dt("وصف البحث"), Boolean(description)],
    [dt("وصف الصورة"), Boolean(values.imageAlt)],
    [
      dt("العبارة المستهدفة"),
      Boolean(
        values.seoKeyword &&
          [title, description].join(" ").includes(values.seoKeyword),
      ),
    ],
  ] as const;
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-sky-100 bg-sky-50 p-4" aria-label={dt("جاهزية بيانات البحث")}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><strong>{dt("جاهزية بيانات البحث")}</strong><span>{checks.filter(([, passed]) => passed).length} / {checks.length}</span></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={checks.length} aria-valuenow={checks.filter(([, passed]) => passed).length} aria-label={dt("جاهزية بيانات البحث")}><div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${checks.filter(([, passed]) => passed).length / checks.length * 100}%` }} /></div>
        <p className="mt-2 text-xs leading-6 text-slate-600">{dt("أكمل العنوان والوصف ثم راجع المعاينة لكل لغة. هذه فحوص تحريرية وليست ضمانًا للترتيب في Google.")}</p>
      </section>
      <nav
        aria-label={dt("أقسام SEO")}
        className="flex flex-wrap gap-2 rounded-xl border bg-white p-2"
      >
        {[
          ["search", dt("محركات البحث")],
          ["share", dt("المشاركة الاجتماعية")],
          ["audit", dt("الفحوص والجاهزية")],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={tab === id}
            className={`rounded-lg px-4 py-3 text-sm ${tab === id ? "bg-brand text-white" : "text-slate-600"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "search" ? (
        <>
          <label className="block space-y-2 rounded-xl border bg-white p-5">
            <span className="font-semibold">{dt("العبارة الرئيسية المستهدفة")}</span>
            <input
              id={`content-${locale}-seoKeyword`}
              maxLength={contentFieldLimit("seoKeyword")}
              className="w-full rounded-lg border p-3"
              value={values.seoKeyword || ""}
              onChange={(e) => onChange("seoKeyword", e.target.value)}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">{fields
            .filter((f) =>
              /^(seoTitle|seoDescription|metaTitle|metaDescription|imageAlt)$/.test(
                f.key,
              ),
            )
            .map(renderField)}</div>
          <section className="rounded-xl border bg-white p-5">
            <h3 className="mb-4 font-semibold">
              {dt("معاينة Google ·")} {locale.toUpperCase()}
            </h3>
            <p dir="ltr" className="mb-2 text-start text-xs text-slate-500">minberiaksa.org</p>
            <p className="max-w-2xl break-words text-xl text-blue-800">{title}</p>
            <p className="mt-2 max-w-2xl break-words text-sm leading-7 text-slate-600">
              {publishedDescription || dt("أضف وصف نتيجة البحث")}
            </p>
            <div className="mt-4 grid gap-2 border-t pt-3 text-xs sm:grid-cols-2"><p>{dt("طول العنوان: {0} حرفًا؛ المقترح 30–60", [Array.from(title).length])}</p><p>{dt("طول الوصف: {0} حرفًا؛ الحد المعروض لهذه اللغة {1}", [Array.from(description).length, descriptionLimit])}</p></div>
            {publishedDescription !== description.trim() ? <p role="status" className="mt-3 text-xs text-amber-800">{dt("تعرض المعاينة الوصف المنشور بعد تنسيقه واختصاره. اختصر النص لرؤيته كاملًا.")}</p> : null}
          </section>
          <label className="flex items-center justify-between gap-3 rounded-xl border bg-white p-5">
            <span>{dt("السماح لمحركات البحث بفهرسة هذه اللغة")}</span>
            <input
              type="checkbox"
              role="switch"
              checked={values.seoNoIndex !== "true"}
              onChange={(e) =>
                onChange("seoNoIndex", e.target.checked ? "false" : "true")
              }
            />
          </label>
          <section className="space-y-4 rounded-xl border bg-white p-5">
            <div className="flex justify-between">
              <h3 className="font-semibold">{dt("الأسئلة الشائعة")}</h3>
              <button
                type="button"
                className="rounded border px-3 py-2 text-sm"
                onClick={() => writeFaq([...faq, { q: "", a: "" }])}
              >
                {dt("إضافة سؤال")}
              </button>
            </div>
            <p className="text-xs leading-6 text-slate-500">
              {dt("تُعرض الأسئلة المحفوظة في الصفحة، وتطابقها البيانات المنظمة. راجع الحقائق قبل الحفظ.")}
            </p>
            {faq.map((item, i) => (
              <fieldset key={i} className="space-y-2 rounded-lg border p-3">
                <label className="block text-sm">
                  {dt("السؤال")} {i + 1}
                  <input
                    maxLength={500}
                    className="mt-2 w-full rounded border p-3"
                    value={item.q}
                    onChange={(e) =>
                      writeFaq(
                        faq.map((v, n) =>
                          n === i ? { ...v, q: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <label className="block text-sm">
                  {dt("الإجابة")}
                  <textarea
                    maxLength={5000}
                    className="mt-2 w-full rounded border p-3"
                    rows={3}
                    value={item.a}
                    onChange={(e) =>
                      writeFaq(
                        faq.map((v, n) =>
                          n === i ? { ...v, a: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={item.structuredData !== false} onChange={(event) =>
                    writeFaq(faq.map((value, index) => index === i ? { ...value, structuredData: event.target.checked } : value))
                  } />
                  {dt("تضمين هذا السؤال في البيانات المنظمة لمحركات البحث")}
                </label>
                <button
                  type="button"
                  className="text-sm text-red-700"
                  onClick={() => writeFaq(faq.filter((_, n) => n !== i))}
                >
                  {dt("حذف السؤال من المسودة")}
                </button>
              </fieldset>
            ))}
          </section>
        </>
      ) : null}
      {tab === "share" ? (
        <>
          <p className="rounded-xl bg-sky-50 p-4 text-sm">
            {dt("عند ترك حقول المشاركة فارغة، تُستخدم إعدادات البحث لهذه اللغة.")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">{fields
            .filter((f) => ["ogTitle", "ogDescription"].includes(f.key))
            .map(renderField)}</div>
          <section className="rounded-xl border bg-white p-5">
            <ImageUploadField
              onUploadingChange={onUploadingChange}
              label={dt("صورة المشاركة لهذه اللغة")}
              value={values.ogImage || ""}
              onChange={(url) => onChange("ogImage", url)}
            />
          </section>
          <section className="overflow-hidden rounded-xl border bg-white">
            {values.ogImage ? (
              // User-supplied upload URLs do not have a fixed image host.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={values.ogImage}
                alt={values.imageAlt || ""}
                className="h-48 w-full object-cover"
              />
            ) : null}
            <div className="space-y-2 p-5">
              <small className="text-slate-500">
                {dt("معاينة Facebook وWhatsApp")}
              </small>
              <h3 className="font-bold">{values.ogTitle || title}</h3>
              <p className="text-sm text-slate-600">
                {values.ogDescription || description}
              </p>
            </div>
          </section>
        </>
      ) : null}
      {tab === "audit" ? (
        <section className="space-y-4 rounded-xl border bg-white p-5">
          <h3 className="font-semibold">{dt("جاهزية تقنية وجودة تحريرية")}</h3>
          <p className="text-sm text-slate-500">
            {dt("اكتمال الحقول لا يضمن ترتيبًا في محركات البحث. راجع النص والمصادر.")}
          </p>
          {checks.map(([label, ok]) => (
            <div key={label} className="flex justify-between border-b py-3">
              <span>{label}</span>
              <span className={ok ? "text-emerald-700" : "text-amber-700"}>
                {ok ? dt("متاح") : dt("يحتاج مراجعة")}
              </span>
            </div>
          ))}
          <p className="text-sm">
            {dt("عنوان البحث:")} {[...title].length} {dt("حرفًا · الوصف:")}{" "}
            {[...description].length} {dt("حرفًا")}
          </p>
        </section>
      ) : null}
    </div>
  );
}
