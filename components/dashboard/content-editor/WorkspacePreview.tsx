"use client";
import Image from "next/image";
import { useState } from "react";
import type {
  ContentKind,
  ContentRecord,
  TextValues,
} from "@/lib/content-editor/contracts";
import { BannerPreview } from "./BannerPreview";
import { parseSuggestedDonations } from "@/lib/campaign/suggested-donations";
import { parseSuggestedShareCounts } from "@/lib/campaign/campaign-modes";
function plain(value: string): string {
  try {
    const doc = JSON.parse(value);
    const read = (n: { text?: string; content?: unknown[] }): string =>
      n.text || (n.content || []).map((c) => read(c as typeof n)).join(" ");
    return read(doc);
  } catch {
    return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  }
}
export function WorkspacePreview({
  kind,
  values,
  source,
  settings,
  locale,
  expanded = false,
}: {
  kind: ContentKind;
  values: TextValues;
  source: TextValues;
  settings: ContentRecord;
  locale: string;
  expanded?: boolean;
}) {
  const [mobile, setMobile] = useState(false);
  const title = values.title || values.name || source.title || source.name;
  const body = plain(
    values.description ||
      values.intro ||
      values.content ||
      source.description ||
      source.intro ||
      "",
  );
  const image = String(
    (Array.isArray(settings.images)
      ? settings.images[0]
      : settings.heroImage || settings.image) || "",
  );
  if (kind === "urgent-banners")
    return (
      <BannerPreview
        values={values}
        source={source}
        settings={settings}
        locale={locale}
        expanded={expanded}
      />
    );
  const goal = Number(settings.targetAmount || 0),
    raised = Number(settings.currentAmount || 0),
    open = settings.goalType === "OPEN" || goal <= 0;
  return (
    <section className="space-y-3" aria-label="معاينة المحتوى المباشرة">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {kind === "campaigns" ? "معاينة بطاقة المشروع" : "معاينة الصفحة"} ·{" "}
          {locale.toUpperCase()}
        </span>
        <span className="text-emerald-700">مباشرة</span>
      </div>
      {expanded ? (
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border px-3 py-1"
            aria-pressed={!mobile}
            onClick={() => setMobile(false)}
          >
            الحاسوب
          </button>
          <button
            type="button"
            className="rounded border px-3 py-1"
            aria-pressed={mobile}
            onClick={() => setMobile(true)}
          >
            الموبايل
          </button>
        </div>
      ) : null}
      <article
        className={`${mobile ? "mx-auto max-w-[390px]" : ""} overflow-hidden rounded-2xl border bg-white shadow-sm`}
        dir={["ar", "ur"].includes(locale) ? "rtl" : "ltr"}
      >
        {image ? (
          <Image
            unoptimized
            src={image}
            alt={values.imageAlt || title || ""}
            width={900}
            height={400}
            className={`${expanded ? "max-h-80" : "h-40"} w-full object-cover`}
          />
        ) : (
          <div className="flex h-32 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-sm text-slate-500">
            لم تُضف صورة
          </div>
        )}
        <div className="space-y-4 p-5">
          <h3 className="text-xl font-bold">{title || "عنوان المحتوى"}</h3>
          <p
            className={`${expanded ? "whitespace-pre-wrap" : "line-clamp-4"} text-sm leading-7 text-slate-600`}
          >
            {body || "أضف وصفًا لهذه اللغة"}
          </p>
          {kind === "campaigns" ? (
            <>
              <div className="flex justify-between gap-2 border-t pt-4">
                <div>
                  <small className="text-slate-500">
                    إجمالي المحصّل بالدولار
                  </small>
                  <p className="text-xl font-bold" dir="ltr">
                    $
                    {raised.toLocaleString("en-US", {
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <span className="text-xs">
                  {open
                    ? "هدف مفتوح"
                    : `الهدف $${goal.toLocaleString("en-US")}`}
                </span>
              </div>
              {!open ? (
                <progress
                  className="h-2 w-full"
                  value={Math.min(raised, goal)}
                  max={goal}
                />
              ) : null}
              <div className="grid grid-cols-3 gap-2">
                {(settings.fundraisingMode === "SHARES"
                  ? Array.isArray(settings.defaultShareCounts)
                    ? settings.defaultShareCounts
                    : parseSuggestedShareCounts(settings.suggestedShareCounts)
                        .counts
                  : Array.isArray(settings.defaultDonationAmounts)
                    ? settings.defaultDonationAmounts
                    : parseSuggestedDonations(settings.suggestedDonations)
                        .amounts
                )
                  .slice(0, 6)
                  .map((v, i) => (
                    <span
                      key={i}
                      className="flex-1 rounded border px-2 py-2 text-center text-xs"
                    >
                      {String(v)}{" "}
                      {settings.fundraisingMode === "SHARES" ? "سهم" : "USD"}
                    </span>
                  ))}
              </div>
              <span className="block rounded-lg bg-brand px-4 py-3 text-center font-semibold text-white">
                تبرع الآن
              </span>
            </>
          ) : null}
          {kind === "super-categories" ? (
            <>
              <div className="flex flex-wrap gap-2">
                {["ctaPrimaryLabel", "ctaSecondaryLabel", "ctaTertiaryLabel"]
                  .filter((k) => values[k])
                  .map((k) => (
                    <span key={k} className="rounded border px-3 py-2 text-xs">
                      {values[k]}
                    </span>
                  ))}
              </div>
              {expanded && Array.isArray(settings.blocks)
                ? settings.blocks
                    .filter((b: ContentRecord) => b.isActive !== false)
                    .map((b: ContentRecord) => (
                      <section
                        key={String(b.id || b.anchor)}
                        className="rounded border p-4"
                      >
                        <h4 className="font-bold">
                          {String(b.title || b.kind)}
                        </h4>
                        <p className="text-sm">{plain(String(b.body || ""))}</p>
                      </section>
                    ))
                : null}
            </>
          ) : null}
        </div>
      </article>
      {!values.title && !values.name && locale !== "ar" ? (
        <p className="text-xs text-amber-700">
          المعاينة تعرض النص البديل؛ لا يُحتسب ترجمة محفوظة.
        </p>
      ) : null}
      {!expanded ? (
        <p className="text-xs leading-6 text-slate-500">
          كما يظهر المحتوى للزائر. تتغير المعاينة مع اللغة والمسودة الحالية.
          أزرار التبرع هنا للعرض فقط.
        </p>
      ) : null}
    </section>
  );
}
