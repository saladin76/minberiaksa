"use client";
import Image from "next/image";
import { useState } from "react";
import type { ContentRecord, TextValues } from "@/lib/content-editor/contracts";
import { localizeContentHref } from "@/lib/content-editor/urls";
export function BannerPreview({
  values,
  source,
  settings,
  locale,
}: {
  values: TextValues;
  source: TextValues;
  settings: ContentRecord;
  locale: string;
}) {
  const [mobile, setMobile] = useState(false),
    get = (key: string) => values[key] || source[key] || "";
  const image = typeof settings.image === "string" ? settings.image : "";
  const amounts = Array.isArray(settings.suggestedAmounts)
      ? settings.suggestedAmounts
      : [],
    labels = get("amountLabels").split("\n");
  const destination =
    typeof settings.ctaUrl === "string" && settings.ctaUrl
      ? localizeContentHref(settings.ctaUrl, locale)
      : settings.campaignId
        ? `/${locale}/campaign/${settings.campaignId}`
        : "";
  const start = settings.startsAt
      ? Date.parse(String(settings.startsAt))
      : null,
    end = settings.endsAt ? Date.parse(String(settings.endsAt)) : null,
    now = Date.now();
  const reason =
    settings.isActive === false
      ? "متوقف"
      : start && start > now
        ? "مجدول"
        : end && end < now
          ? "انتهت المدة"
          : "مفعّل";
  return (
    <section className="space-y-3 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">معاينة البانر</h3>
        <div className="flex gap-2">
          <button
            className="rounded border px-2 text-xs"
            type="button"
            aria-pressed={!mobile}
            onClick={() => setMobile(false)}
          >
            حاسوب
          </button>
          <button
            className="rounded border px-2 text-xs"
            type="button"
            aria-pressed={mobile}
            onClick={() => setMobile(true)}
          >
            موبايل
          </button>
        </div>
      </div>
      <div
        className={`${mobile ? "max-w-[390px]" : "w-full"} overflow-hidden rounded-xl bg-slate-900 text-white`}
      >
        {get("kicker") ? (
          <p className="bg-amber-100 p-2 text-center text-xs text-slate-900">
            {get("kicker")}
          </p>
        ) : null}
        {image ? (
          <Image
            unoptimized
            width={800}
            height={320}
            src={image}
            alt={get("imageAlt") || get("title")}
            className="h-36 w-full object-cover"
          />
        ) : null}
        <div className="space-y-3 p-4">
          <h4 className="text-lg font-bold">{get("title")}</h4>
          <p className="text-sm">{get("description")}</p>
          <div className="flex flex-wrap gap-2">
            {amounts.map((amount, i) => (
              <span key={i} className="rounded border px-2 py-1 text-xs">
                <span dir="ltr">{String(amount)} USD</span> {labels[i]}
              </span>
            ))}
          </div>
          {get("ctaLabel") ? (
            <span className="inline-block rounded bg-white px-3 py-2 text-sm text-slate-900">
              {get("ctaLabel")}
            </span>
          ) : null}
        </div>
      </div>
      <p className="text-sm">الحالة: {reason}</p>
      <p className="text-xs text-slate-500">
        الوجهة:{" "}
        <span dir="ltr" className="break-all">
          {destination || "لم تُحدد"}
        </span>
      </p>
      {!values.title && locale !== "ar" ? (
        <p className="text-xs text-amber-800">
          المعاينة تعرض النص العربي البديل؛ لا يُحتسب ترجمة محفوظة.
        </p>
      ) : null}
      {start || end ? (
        <p className="text-xs text-slate-500">
          بتوقيت إسطنبول:{" "}
          {start
            ? new Intl.DateTimeFormat("ar", {
                timeZone: "Europe/Istanbul",
                dateStyle: "short",
                timeStyle: "short",
              }).format(start)
            : "بدون بداية"}{" "}
          –{" "}
          {end
            ? new Intl.DateTimeFormat("ar", {
                timeZone: "Europe/Istanbul",
                dateStyle: "short",
                timeStyle: "short",
              }).format(end)
            : "بدون نهاية"}
        </p>
      ) : null}
    </section>
  );
}
