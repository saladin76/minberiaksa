"use client";
import { useEffect, useState } from "react";
import { ImageUploadField } from "@/app/(dashboard)/dashboard/_components/ImageUploadField";
import { BANNER_PAGES } from "@/lib/minbar/banner-placements";
import { LOCALES, SUPPORTED_LOCALES } from "@/lib/locales";
import { settingsFields } from "@/lib/content-editor/workspace";
import type {
  ContentKind,
  ContentRecord,
} from "@/lib/content-editor/contracts";
type Option = {
  id: string;
  title: string;
  categoryIds?: string[];
  priority?: number;
};
export type EditorCatalog = {
  categories: Option[];
  campaigns: Option[];
  postCategories: Option[];
  linked: Record<string, (Option & { live?: boolean })[]>;
};
export function useEditorCatalog(kind: ContentKind) {
  const [catalog, setCatalog] = useState<EditorCatalog>({
    categories: [],
    campaigns: [],
    postCategories: [],
    linked: {},
  });
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch(`/api/admin/content-editor/${kind}/catalog`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (
          kind === "super-categories" ||
          (kind === "categories" && data.hasCategoryLibrary === true)
        ) {
          const linked = await fetch("/api/super-categories/content-options", {
            signal: controller.signal,
          });
          if (!linked.ok) throw new Error("تعذر تحميل مكتبة المحتوى");
          data.linked = await linked.json();
        }
        setCatalog(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e.message || "تعذر تحميل القوائم");
      });
    return () => controller.abort();
  }, [kind]);
  return { catalog, error };
}
const inputClass =
  "w-full rounded-lg border bg-white p-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10";
function istanbulInput(value: unknown) {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 3 * 3600000).toISOString().slice(0, 16);
}
export function WorkspaceSettings({
  kind,
  section,
  settings,
  onChange,
  catalog,
  onUploadingChange,
}: {
  kind: ContentKind;
  section: string;
  settings: ContentRecord;
  onChange: (key: string, value: unknown) => void;
  catalog: EditorCatalog;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      {settingsFields(kind, settings)
        .filter(
          (f) =>
            f.section === section &&
            !(
              kind === "campaigns" &&
              ((settings.goalType === "OPEN" && f.key === "targetAmount") ||
                (settings.fundraisingMode !== "SHARES" &&
                  ["sharePriceUSD", "defaultShareCounts"].includes(f.key)) ||
                (settings.fundraisingMode === "SHARES" &&
                  f.key === "defaultDonationAmounts"))
            ),
        )
        .map((f) => {
          const value = settings[f.key];
          let options: { id: string; title: string }[] = [];
          if (f.key === "categoryIds") options = catalog.categories;
          if (["campaignId", "campaignIds"].includes(f.key))
            options = catalog.campaigns;
          if (f.key === "donateCampaignId")
            options = catalog.campaigns.filter((c) =>
              c.categoryIds?.includes(String(settings.id)),
            );
          if (f.key === "achievementVideoIds")
            options = catalog.linked.VIDEO || [];
          if (f.key === "categoryId") options = catalog.postCategories;
          if (["locales", "heroVideoLocales"].includes(f.key))
            options = SUPPORTED_LOCALES.map((id) => ({
              id,
              title: LOCALES[id].nativeLabel,
            }));
          if (f.key === "placements")
            options = BANNER_PAGES.flatMap((p) =>
              p.slots.map((s) => ({
                id: `${p.key}:${s.key}`,
                title: `${p.label} · ${s.label}`,
              })),
            );
          if (f.type === "image")
            return (
              <section key={f.key} className="rounded-xl border bg-white p-5">
                <ImageUploadField
                  onUploadingChange={onUploadingChange}
                  label={f.label}
                  value={String(value || "")}
                  onChange={(url) => onChange(f.key, url)}
                  previewClass="w-full h-48"
                />
                <label className="mt-3 block text-xs text-slate-500">
                  أو رابط صورة
                  <input
                    className={inputClass + " mt-2"}
                    value={String(value || "")}
                    dir="ltr"
                    onChange={(e) => onChange(f.key, e.target.value)}
                  />
                </label>
              </section>
            );
          if (f.type === "images") {
            const list = Array.isArray(value) ? value.map(String) : [];
            return (
              <section
                key={f.key}
                className="space-y-4 rounded-xl border bg-white p-5"
              >
                <h3 className="font-bold">{f.label}</h3>
                <p className="text-xs text-slate-500">
                  الصورة الأولى رئيسية. غيّر ترتيب الصور أو أضف صورة جديدة.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {list.map((url, i) => (
                    <div key={url + i} className="space-y-2 rounded border p-3">
                      <ImageUploadField
                        onUploadingChange={onUploadingChange}
                        label={i === 0 ? "الصورة الرئيسية" : `الصورة ${i + 1}`}
                        value={url}
                        onChange={(next) =>
                          onChange(
                            f.key,
                            next
                              ? list.map((v, n) => (n === i ? next : v))
                              : list.filter((_, n) => n !== i),
                          )
                        }
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!i}
                          className="rounded border px-3 py-1 text-xs disabled:opacity-40"
                          onClick={() => {
                            const next = [...list];
                            [next[i - 1], next[i]] = [next[i], next[i - 1]];
                            onChange(f.key, next);
                          }}
                        >
                          تقديم
                        </button>
                        <button
                          type="button"
                          disabled={i === list.length - 1}
                          className="rounded border px-3 py-1 text-xs disabled:opacity-40"
                          onClick={() => {
                            const next = [...list];
                            [next[i + 1], next[i]] = [next[i], next[i + 1]];
                            onChange(f.key, next);
                          }}
                        >
                          تأخير
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <ImageUploadField
                  onUploadingChange={onUploadingChange}
                  label="إضافة صورة"
                  value=""
                  onChange={(url) => {
                    if (url) onChange(f.key, [...list, url]);
                  }}
                />
              </section>
            );
          }
          if (f.type === "numbers") {
            const list = Array.isArray(value) ? value.map(Number) : [];
            return (
              <fieldset
                key={f.key}
                className="space-y-3 rounded-xl border bg-white p-5"
              >
                <legend className="px-2 text-sm font-semibold">
                  {f.label}
                </legend>
                {list.map((amount, index) => (
                  <label key={index} className="flex items-center gap-2">
                    <span className="w-20 text-xs text-slate-500">
                      القيمة {index + 1}
                    </span>
                    <input
                      aria-label={`${f.label} ${index + 1}`}
                      type="number"
                      min="1"
                      className={inputClass + " flex-1"}
                      value={amount}
                      onChange={(e) =>
                        onChange(
                          f.key,
                          list.map((v, i) =>
                            i === index ? Number(e.target.value) : v,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="rounded border p-2 text-xs text-red-700"
                      onClick={() =>
                        onChange(
                          f.key,
                          list.filter((_, i) => i !== index),
                        )
                      }
                    >
                      إزالة
                    </button>
                  </label>
                ))}
                <button
                  type="button"
                  disabled={list.length >= 20}
                  className="rounded border px-3 py-2 text-sm"
                  onClick={() =>
                    onChange(f.key, [
                      ...list,
                      f.key === "defaultShareCounts" ? 1 : 50,
                    ])
                  }
                >
                  إضافة قيمة
                </button>
                {kind === "campaigns" ? (
                  <p className="text-xs leading-6 text-slate-500">
                    تُحفظ تخصيصات العملات الأخرى كما هي. لا تتغير المبالغ
                    المحصّلة.
                  </p>
                ) : (
                  <p className="text-xs leading-6 text-amber-700">
                    راجع تسميات هذه المبالغ في جميع اللغات عند تغيير قيمها أو
                    ترتيبها.
                  </p>
                )}
              </fieldset>
            );
          }
          if (f.type === "boolean")
            return (
              <label
                key={f.key}
                className="flex items-center justify-between gap-3 rounded-xl border bg-white p-5"
              >
                <span className="font-semibold">{f.label}</span>
                <input
                  type="checkbox"
                  role="switch"
                  className="h-5 w-5 accent-brand"
                  checked={Boolean(value)}
                  onChange={(e) => onChange(f.key, e.target.checked)}
                />
              </label>
            );
          if (f.type === "ids" && Array.isArray(value))
            return (
              <fieldset
                key={f.key}
                className="space-y-3 rounded-xl border bg-white p-5"
              >
                <legend className="px-2 text-sm font-semibold">
                  {f.label}
                </legend>
                <div className="grid max-h-72 gap-2 overflow-auto sm:grid-cols-2">
                  {options.map((o) => (
                    <label
                      key={o.id}
                      className="flex gap-2 rounded border p-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={value.includes(o.id)}
                        onChange={(e) =>
                          onChange(
                            f.key,
                            e.target.checked
                              ? [...value, o.id]
                              : value.filter((x) => x !== o.id),
                          )
                        }
                      />
                      {o.title}
                    </label>
                  ))}
                </div>
                {!options.length ? (
                  <p className="text-sm text-slate-500">
                    لا توجد خيارات متاحة.
                  </p>
                ) : null}
              </fieldset>
            );
          return (
            <label
              key={f.key}
              className="block space-y-2 rounded-xl border bg-white p-5"
            >
              <span className="text-sm font-semibold">{f.label}</span>
              {f.type === "select" || f.type === "ids" ? (
                <select
                  className={inputClass}
                  value={String(value ?? "")}
                  onChange={(e) => onChange(f.key, e.target.value)}
                >
                  <option value="">بدون اختيار</option>
                  {(f.options || options.map((o) => [o.id, o.title])).map(
                    ([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              ) : (
                <input
                  className={inputClass}
                  type={
                    f.type === "number"
                      ? "number"
                      : f.type === "date"
                        ? "datetime-local"
                        : "text"
                  }
                  min={f.type === "number" ? 0 : undefined}
                  step={f.type === "number" ? "any" : undefined}
                  dir={
                    ["url", "date", "numbers"].includes(f.type)
                      ? "ltr"
                      : undefined
                  }
                  value={
                    f.type === "date"
                      ? istanbulInput(value)
                      : Array.isArray(value)
                        ? value.join(", ")
                        : String(value ?? "")
                  }
                  onChange={(e) =>
                    onChange(
                      f.key,
                      f.type === "number"
                        ? Number(e.target.value)
                        : f.type === "numbers"
                          ? e.target.value
                              .split(/[,،]/)
                              .map(Number)
                              .filter((n) => n > 0)
                          : e.target.value,
                    )
                  }
                />
              )}
            </label>
          );
        })}
    </div>
  );
}
