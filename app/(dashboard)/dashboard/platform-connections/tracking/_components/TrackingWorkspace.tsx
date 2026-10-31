"use client";
import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { dt } from "@/lib/dashboard/i18n";
import { GoogleSearchAccounts } from "@/components/dashboard/GoogleSearchAccounts";
const PixelSettings = dynamic(() => import("./TrackingSettingsManager"), {
  loading: () => <p>{dt("جار التحميل…")}</p>,
});
const AiSettings = dynamic(() => import("./AiConnectionSettings"), {
  loading: () => <p>{dt("جار التحميل…")}</p>,
});
export function TrackingWorkspace({
  canManage,
  canTest,
  children,
}: {
  canManage: boolean;
  canTest: boolean;
  children: ReactNode;
}) {
  const [tab, setTab] = useState("overview");
  const tabs = [
    ["overview", "نظرة عامة"],
    ["accounts", "حسابات Google Ads"],
    ["pixels", "البكسلات والتحويلات"],
    ["ai", "الذكاء الاصطناعي"],
  ];
  return (
    <section className="space-y-5">
      <nav
        aria-label={dt("أقسام الربط")}
        className="flex flex-wrap gap-2 rounded-xl border bg-white p-2"
      >
        {tabs.map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-3 text-sm ${tab === key ? "bg-brand text-white" : "hover:bg-slate-50"}`}
          >
            {dt(label)}
          </button>
        ))}
      </nav>
      {tab === "overview" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [
                "accounts",
                "حسابات إعلانية متعددة",
                "ربط كل حساب Google Ads مستقلًا، مدفوعًا أو منحة.",
              ],
              [
                "pixels",
                "أحداث التبرع والتحويل",
                "إعداد المعرفات ومراجعة أحداث المتصفح والخادم.",
              ],
              [
                "ai",
                "اتصال الذكاء الاصطناعي",
                "مفتاح ونموذج مركزيان للترجمة والتحرير والتحليل.",
              ],
            ].map(([key, title, description]) => (
              <button
                type="button"
                key={key}
                onClick={() => setTab(key)}
                className="rounded-xl border bg-white p-4 text-start"
              >
                <strong className="text-sm">{dt(title)}</strong>
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  {dt(description)}
                </p>
              </button>
            ))}
          </div>
          {children}
        </>
      ) : null}
      {tab === "accounts" ? (
        <div>
          <GoogleSearchAccounts
            initialOpen
            canManage={canManage}
            canTest={canTest}
            onChanged={() => {}}
          />
        </div>
      ) : null}
      {tab === "pixels" ? (
        <PixelSettings canManage={canManage} canTest={canTest} />
      ) : null}
      {tab === "ai" ? (
        <AiSettings canManage={canManage} canTest={canTest} />
      ) : null}
    </section>
  );
}
