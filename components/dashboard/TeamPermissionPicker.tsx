"use client";
import { useMemo, useState } from "react";
import { dt } from "@/lib/dashboard/i18n";
import {
  DASHBOARD_PERMISSION_ROWS,
  ACTION_PERMISSION_ROWS,
  DASHBOARD_NAV_GROUPS,
} from "@/lib/dashboard/nav-config";
const presets = [
  {
    name: "محرر المحتوى",
    keys: [
      "campaigns",
      "categories",
      "blog",
      "siteContent",
      "slides",
      "ticker",
    ],
  },
  {
    name: "التواصل وخدمة المتبرعين",
    keys: ["donors", "messages", "templates", "badges"],
  },
  { name: "التقارير المالية", keys: ["revenue", "monthly", "bankTransfers"] },
  {
    name: "التسويق والتحليلات",
    keys: ["referrals", "pixels", "platformConnections"],
  },
];
export function TeamPermissionPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const groups = useMemo(
    () => [...new Set(DASHBOARD_PERMISSION_ROWS.map((row) => row.group))],
    [],
  );
  const visible = DASHBOARD_PERMISSION_ROWS.filter((row) =>
    (row.title + " " + row.group)
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const toggle = (key: string) =>
    onChange(
      value.includes(key) ? value.filter((v) => v !== key) : [...value, key],
    );
  const pages = DASHBOARD_NAV_GROUPS.flatMap((group) => group.items).filter(
    (item) =>
      !item.adminOnly &&
      (value.includes(item.key) ||
        item.anyPermissions?.some((key) => value.includes(key))),
  );
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <div className="rounded-xl border bg-sky-50 p-3 text-sm">
        <strong>{dt("معاينة الوصول")}</strong>
        <p className="mt-1 text-xs">
          {dt("{0} أقسام و{1} إجراءات إضافية", [
            DASHBOARD_PERMISSION_ROWS.filter((row) => value.includes(row.key))
              .length,
            ACTION_PERMISSION_ROWS.filter((row) => value.includes(row.key))
              .length,
          ])}
        </p>
        <p className="mt-2 text-xs leading-6">
          {pages.map((page) => page.title).join(" · ") ||
            dt("لم تُحدد صفحات بعد")}
        </p>
        <p className="mt-2 text-xs">
          {dt(
            "إدارة الأعضاء والحذف والأمان وتغيير الصلاحيات تبقى خاصة بالإدارة.",
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            type="button"
            key={preset.name}
            className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
            onClick={() => onChange([...preset.keys])}
          >
            {dt(preset.name)}
          </button>
        ))}
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-xs"
          onClick={() => onChange([])}
        >
          {dt("مسح الاختيارات")}
        </button>
      </div>
      <label className="block text-sm">
        <span>{dt("البحث في الصلاحيات")}</span>
        <input
          className="mt-1 w-full rounded-lg border p-2"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {groups.map((group) => {
        const rows = visible.filter((row) => row.group === group);
        if (!rows.length) return null;
        const all = rows.every((row) => value.includes(row.key));
        return (
          <section key={group} className="rounded-xl border p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">{group}</h3>
              <button
                type="button"
                className="text-xs underline"
                onClick={() =>
                  onChange(
                    all
                      ? value.filter(
                          (key) => !rows.some((row) => row.key === key),
                        )
                      : [...new Set([...value, ...rows.map((row) => row.key)])],
                  )
                }
              >
                {all ? dt("إلغاء تحديد المجموعة") : dt("تحديد المجموعة")}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {rows.map((row) => (
                <label
                  key={row.key}
                  className="flex gap-2 rounded-lg bg-slate-50 p-2 text-xs leading-6"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(row.key)}
                    onChange={() => toggle(row.key)}
                  />
                  <span>{row.title}</span>
                </label>
              ))}
            </div>
          </section>
        );
      })}
      <section className="rounded-xl border border-amber-200 p-3">
        <h3 className="mb-2 text-sm font-bold">{dt("الإجراءات الإضافية")}</h3>
        <div className="grid gap-2">
          {ACTION_PERMISSION_ROWS.filter((row) =>
            (row.title + row.description)
              .toLowerCase()
              .includes(search.toLowerCase()),
          ).map((row) => (
            <label
              key={row.key}
              className="flex gap-2 rounded-lg border p-2 text-xs"
            >
              <input
                type="checkbox"
                checked={value.includes(row.key)}
                onChange={() => toggle(row.key)}
              />
              <span>
                <strong>{row.title}</strong>
                <span className="mt-1 block text-slate-500">
                  {row.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>
    </fieldset>
  );
}
