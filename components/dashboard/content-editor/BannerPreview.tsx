"use client";
import Image from "next/image";
import { useState } from "react";
import type { ContentRecord, TextValues } from "@/lib/content-editor/contracts";
import { localizeContentHref } from "@/lib/content-editor/urls";
import { BANNER_PAGES } from "@/lib/minbar/banner-placements";
export function BannerPreview({
  values,
  source,
  settings,
  locale,
  expanded = false,
}: {
  values: TextValues;
  source: TextValues;
  settings: ContentRecord;
  locale: string;
  expanded?: boolean;
}) {
  const [mobile, setMobile] = useState(false),
    get = (key: string) => values[key] || source[key] || "";
  const [placement, setPlacement] = useState("home:top");
  const [page, slot] = placement.split(":");
  const placements = Array.isArray(settings.placements)
    ? settings.placements
    : [];
  const matches =
    placements.includes(placement) || placements.includes(`all:${slot}`);
  const color: Record<string, string> = {
    red: "#7c2318",
    navy: "#15263c",
    gold: "#91691b",
    green: "#1c6651",
  };
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
    Array.isArray(settings.locales) &&
    settings.locales.length &&
    !settings.locales.includes(locale)
      ? "مستبعد لهذه اللغة"
      : settings.isActive === false
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
      {expanded ? (
        <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
          <label className="block space-y-2 text-sm">
            محاكاة موضع العرض
            <select
              className="w-full rounded border p-2"
              value={placement}
              onChange={(e) => setPlacement(e.target.value)}
            >
              {BANNER_PAGES.filter((p) => p.key !== "all").flatMap((p) =>
                p.slots.map((s) => (
                  <option key={`${p.key}:${s.key}`} value={`${p.key}:${s.key}`}>
                    {p.label} · {s.label}
                  </option>
                )),
              )}
            </select>
          </label>
          <p
            className={
              matches ? "text-xs text-emerald-700" : "text-xs text-amber-700"
            }
          >
            {matches
              ? "هذا الموضع ضمن إعدادات البانر."
              : "هذا الموضع غير مفعّل للبانر؛ المحاكاة أدناه للمراجعة فقط."}
          </p>
          <div className="rounded border border-dashed bg-white p-4 text-xs text-slate-400">
            {BANNER_PAGES.find((p) => p.key === page)?.label} ·{" "}
            {slot === "top"
              ? "ترويسة الصفحة"
              : slot === "bottom"
                ? "المحتوى السابق للموضع السفلي"
                : "بداية محتوى الصفحة"}
          </div>
        </div>
      ) : null}
      <div
        className={`${mobile ? "max-w-[390px]" : "w-full"} overflow-hidden rounded-xl bg-slate-900 text-white`}
        style={{ backgroundColor: color[String(settings.tone)] || color.navy }}
      >
        {get("kicker") ? (
          <p className="bg-amber-100 p-2 text-center text-xs text-slate-900">
            {get("kicker")}
          </p>
        ) : null}
        <div
          className={
            expanded && !mobile && image ? "grid grid-cols-2 items-center" : ""
          }
        >
          {image ? (
            <Image
              unoptimized
              width={800}
              height={320}
              src={image}
              alt={get("imageAlt") || get("title")}
              className={`h-48 w-full object-cover ${expanded && !mobile && settings.textSide === "start" ? "order-2" : ""}`}
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
            {get("ctaSecondaryLabel") ? (
              <span className="ms-2 inline-block rounded border px-3 py-2 text-sm">
                {get("ctaSecondaryLabel")}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {expanded ? (
        <div className="rounded border border-dashed bg-slate-50 p-4 text-xs text-slate-400">
          {slot === "bottom" ? "تذييل الصفحة" : "بقية محتوى الصفحة"}
        </div>
      ) : null}
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
