"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tag } from "lucide-react";
import {
  SHARE_LABEL_LOCALES,
  buildShareLabelsPayload,
  type ShareLabelLocale,
  type ShareLabelsConfig,
} from "@/lib/campaign/share-labels";

interface LocaleMeta {
  code: ShareLabelLocale;
  name: string;
  dir: "rtl" | "ltr";
  placeholderSingular: string;
  placeholderPlural: string;
}

/** Locale display names + example placeholders to nudge admins toward the right form. */
const LOCALE_META: LocaleMeta[] = [
  { code: "ar", name: "العربية", dir: "rtl", placeholderSingular: "مثال: خروف", placeholderPlural: "مثال: خراف" },
  { code: "en", name: "English", dir: "ltr", placeholderSingular: "e.g. sheep", placeholderPlural: "e.g. sheep" },
  { code: "fr", name: "Français", dir: "ltr", placeholderSingular: "ex. mouton", placeholderPlural: "ex. moutons" },
  { code: "tr", name: "Türkçe", dir: "ltr", placeholderSingular: "örn. koyun", placeholderPlural: "örn. koyunlar" },
  { code: "id", name: "Bahasa", dir: "ltr", placeholderSingular: "contoh: domba", placeholderPlural: "contoh: domba" },
  { code: "pt", name: "Português", dir: "ltr", placeholderSingular: "ex. ovelha", placeholderPlural: "ex. ovelhas" },
  { code: "es", name: "Español", dir: "ltr", placeholderSingular: "ej. oveja", placeholderPlural: "ej. ovejas" },
  { code: "de", name: "Deutsch", dir: "ltr", placeholderSingular: "z. B. Schaf", placeholderPlural: "z. B. Schafe" },
];

export type ShareLabelsPayload = ShareLabelsConfig | null;

export type ShareLabelsSectionRef = {
  getPayload: () => ShareLabelsPayload;
};

interface Props {
  initialConfig?: ShareLabelsConfig | null;
}

type RowState = Record<ShareLabelLocale, { singular: string; plural: string }>;

function buildInitialRows(cfg: ShareLabelsConfig | null | undefined): RowState {
  const out = {} as RowState;
  for (const meta of LOCALE_META) {
    const entry = cfg?.[meta.code];
    out[meta.code] = {
      singular: entry?.singular ?? "",
      plural: entry?.plural ?? "",
    };
  }
  return out;
}

export const ShareLabelsSection = forwardRef<ShareLabelsSectionRef, Props>(
  function ShareLabelsSection({ initialConfig }, ref) {
    const [rows, setRows] = useState<RowState>(() => buildInitialRows(initialConfig));

    const stableKey = useMemo(() => JSON.stringify(initialConfig ?? null), [initialConfig]);

    useEffect(() => {
      setRows(buildInitialRows(initialConfig));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stableKey]);

    useImperativeHandle(ref, () => ({
      getPayload: () => buildShareLabelsPayload(rows),
    }));

    const update = (locale: ShareLabelLocale, key: "singular" | "plural", value: string) => {
      setRows((prev) => ({ ...prev, [locale]: { ...prev[locale], [key]: value } }));
    };

    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
        <div className="flex items-start gap-2.5 justify-end">
          <div className="text-right flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 justify-end">
              تسمية الوحدة (اختياري)
              <Tag className="w-4 h-4 text-brand-orange" />
            </h3>
            <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
              غيّر كلمة «سهم/أسهم» إلى ما يناسب طبيعة المشروع (مثل خروف/خراف، وجبة/وجبات، حقيبة/حقائب).
              اترك الحقول فارغة لاستخدام التسميات الافتراضية.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[auto_1fr_1fr] gap-2 sm:gap-3 items-center text-right">
          <span className="text-[11px] font-semibold text-slate-500" />
          <span className="text-[11px] font-semibold text-slate-500 text-right">المفرد</span>
          <span className="text-[11px] font-semibold text-slate-500 text-right">الجمع</span>

          {LOCALE_META.map((meta) => (
            <Row
              key={meta.code}
              meta={meta}
              singular={rows[meta.code].singular}
              plural={rows[meta.code].plural}
              onChange={update}
            />
          ))}
        </div>
      </div>
    );
  }
);

function Row({
  meta,
  singular,
  plural,
  onChange,
}: {
  meta: LocaleMeta;
  singular: string;
  plural: string;
  onChange: (locale: ShareLabelLocale, key: "singular" | "plural", value: string) => void;
}) {
  return (
    <>
      <Label className="text-xs font-medium text-slate-600 whitespace-nowrap">
        {meta.name}
        <span className="ms-1 text-[10px] text-slate-400 font-normal uppercase">{meta.code}</span>
      </Label>
      <Input
        value={singular}
        onChange={(e) => onChange(meta.code, "singular", e.target.value)}
        placeholder={meta.placeholderSingular}
        dir={meta.dir}
        className="h-9 text-sm"
      />
      <Input
        value={plural}
        onChange={(e) => onChange(meta.code, "plural", e.target.value)}
        placeholder={meta.placeholderPlural}
        dir={meta.dir}
        className="h-9 text-sm"
      />
    </>
  );
}
