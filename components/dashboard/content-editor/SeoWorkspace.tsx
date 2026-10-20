"use client";
import { useState, type ReactNode } from "react";
import type { ContentField, TextValues } from "@/lib/content-editor/contracts";
import { ImageUploadField } from "@/app/(dashboard)/dashboard/_components/ImageUploadField";
type Faq = { q: string; a: string };
export function SeoWorkspace({
  values,
  fields,
  renderField,
  onChange,
  locale,
  onUploadingChange,
}: {
  values: TextValues;
  fields: ContentField[];
  renderField: (field: ContentField) => ReactNode;
  onChange: (key: string, value: string) => void;
  locale: string;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [tab, setTab] = useState("search");
  let faq: Faq[] = [];
  try {
    faq = JSON.parse(values.faqContent || "[]");
  } catch {
    /* show a recoverable empty draft */
  }
  const title =
      values.seoTitle || values.metaTitle || values.title || values.name || "",
    description = values.seoDescription || values.metaDescription || "";
  const writeFaq = (next: Faq[]) =>
    onChange("faqContent", JSON.stringify(next));
  const checks = [
    ["عنوان البحث", Boolean(values.seoTitle || values.metaTitle)],
    ["وصف البحث", Boolean(description)],
    ["وصف الصورة", Boolean(values.imageAlt)],
    [
      "العبارة المستهدفة",
      Boolean(
        values.seoKeyword &&
          [title, description].join(" ").includes(values.seoKeyword),
      ),
    ],
  ] as const;
  return (
    <div className="space-y-5">
      <nav
        aria-label="أقسام SEO"
        className="flex flex-wrap gap-2 rounded-xl border bg-white p-2"
      >
        {[
          ["search", "محركات البحث"],
          ["share", "المشاركة الاجتماعية"],
          ["audit", "الفحوص والجاهزية"],
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
            <span className="font-semibold">العبارة الرئيسية المستهدفة</span>
            <input
              className="w-full rounded-lg border p-3"
              value={values.seoKeyword || ""}
              onChange={(e) => onChange("seoKeyword", e.target.value)}
            />
          </label>
          {fields
            .filter((f) =>
              /^(seoTitle|seoDescription|metaTitle|metaDescription|imageAlt)$/.test(
                f.key,
              ),
            )
            .map(renderField)}
          <section className="rounded-xl border bg-white p-5">
            <h3 className="mb-4 font-semibold">
              معاينة Google · {locale.toUpperCase()}
            </h3>
            <p className="text-xl text-blue-800">{title}</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              {description || "أضف وصف نتيجة البحث"}
            </p>
          </section>
          <label className="flex items-center justify-between gap-3 rounded-xl border bg-white p-5">
            <span>السماح لمحركات البحث بفهرسة هذه اللغة</span>
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
              <h3 className="font-semibold">الأسئلة الشائعة</h3>
              <button
                type="button"
                className="rounded border px-3 py-2 text-sm"
                onClick={() => writeFaq([...faq, { q: "", a: "" }])}
              >
                إضافة سؤال
              </button>
            </div>
            <p className="text-xs leading-6 text-slate-500">
              تُعرض الأسئلة المحفوظة في الصفحة، وتطابقها البيانات المنظمة. راجع
              الحقائق قبل الحفظ.
            </p>
            {faq.map((item, i) => (
              <fieldset key={i} className="space-y-2 rounded-lg border p-3">
                <label className="block text-sm">
                  السؤال {i + 1}
                  <input
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
                  الإجابة
                  <textarea
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
                <button
                  type="button"
                  className="text-sm text-red-700"
                  onClick={() => writeFaq(faq.filter((_, n) => n !== i))}
                >
                  حذف السؤال من المسودة
                </button>
              </fieldset>
            ))}
          </section>
        </>
      ) : null}
      {tab === "share" ? (
        <>
          <p className="rounded-xl bg-sky-50 p-4 text-sm">
            عند ترك حقول المشاركة فارغة، تُستخدم إعدادات البحث لهذه اللغة.
          </p>
          {fields
            .filter((f) => ["ogTitle", "ogDescription"].includes(f.key))
            .map(renderField)}
          <section className="rounded-xl border bg-white p-5">
            <ImageUploadField
              onUploadingChange={onUploadingChange}
              label="صورة المشاركة لهذه اللغة"
              value={values.ogImage || ""}
              onChange={(url) => onChange("ogImage", url)}
            />
          </section>
          <section className="overflow-hidden rounded-xl border bg-white">
            {values.ogImage ? (
              /* eslint-disable-next-line @next/next/no-img-element */ <img
                src={values.ogImage}
                alt={values.imageAlt || ""}
                className="h-48 w-full object-cover"
              />
            ) : null}
            <div className="space-y-2 p-5">
              <small className="text-slate-500">
                معاينة Facebook وWhatsApp
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
          <h3 className="font-semibold">جاهزية تقنية وجودة تحريرية</h3>
          <p className="text-sm text-slate-500">
            اكتمال الحقول لا يضمن ترتيبًا في محركات البحث. راجع النص والمصادر.
          </p>
          {checks.map(([label, ok]) => (
            <div key={label} className="flex justify-between border-b py-3">
              <span>{label}</span>
              <span className={ok ? "text-emerald-700" : "text-amber-700"}>
                {ok ? "متاح" : "يحتاج مراجعة"}
              </span>
            </div>
          ))}
          <p className="text-sm">
            عنوان البحث: {[...title].length} حرفًا · الوصف:{" "}
            {[...description].length} حرفًا
          </p>
        </section>
      ) : null}
    </div>
  );
}
