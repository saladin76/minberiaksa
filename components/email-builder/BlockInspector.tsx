"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { EmailDocument } from "./types";
import { getBlock, setBlock, deleteBlock, getRoot, FONT_FAMILIES } from "./types";
import { VARIABLE_CATALOG } from "@/lib/templates/variables";

interface Props {
  doc: EmailDocument;
  selectedId: string | null;
  onChange: (next: EmailDocument) => void;
  onSelect: (id: string | null) => void;
}

export function BlockInspector({ doc, selectedId, onChange, onSelect }: Props) {
  if (!selectedId || selectedId === "root") {
    return <RootInspector doc={doc} onChange={onChange} />;
  }
  const block = getBlock(doc, selectedId);
  if (!block) {
    return <div className="text-sm text-muted-foreground p-4">القالب غير موجود</div>;
  }

  const update = (patch: {
    props?: Record<string, unknown>;
    style?: Record<string, unknown>;
  }) => {
    const next = setBlock(doc, selectedId, {
      ...block,
      data: {
        ...block.data,
        props: { ...(block.data.props ?? {}), ...(patch.props ?? {}) },
        style: { ...(block.data.style ?? {}), ...(patch.style ?? {}) },
      },
    });
    onChange(next);
  };

  const handleDelete = () => {
    onChange(deleteBlock(doc, selectedId));
    onSelect(null);
  };

  const props = (block.data.props ?? {}) as Record<string, unknown>;
  const style = (block.data.style ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <span className="text-xs font-semibold text-muted-foreground">{block.type}</span>
        <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-600 h-7">
          <Trash2 className="w-3.5 h-3.5 me-1" /> حذف
        </Button>
      </div>

      {block.type === "Heading" && (
        <>
          <Field label="النص">
            <TextareaWithVariables
              value={String(props.text ?? "")}
              onChange={(v) => update({ props: { text: v } })}
            />
          </Field>
          <Field label="المستوى">
            <Select
              value={String(props.level ?? "h2")}
              onValueChange={(v) => update({ props: { level: v } })}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="h1">H1 — أكبر</SelectItem>
                <SelectItem value="h2">H2</SelectItem>
                <SelectItem value="h3">H3 — أصغر</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <FontFamilyField value={style.fontFamily as string | undefined} onChange={(v) => update({ style: { fontFamily: v || undefined } })} />
          <Field label="السمك">
            <Select
              value={String(style.fontWeight ?? "bold")}
              onValueChange={(v) => update({ style: { fontWeight: v } })}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">عادي</SelectItem>
                <SelectItem value="bold">ثقيل</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <ColorField label="لون النص" value={String(style.color ?? "#1F2937")} onChange={(v) => update({ style: { color: v } })} />
          <ColorField
            label="لون الخلفية"
            value={String(style.backgroundColor ?? "")}
            allowEmpty
            onChange={(v) => update({ style: { backgroundColor: v || undefined } })}
          />
          <AlignField value={String(style.textAlign ?? "right")} onChange={(v) => update({ style: { textAlign: v } })} />
        </>
      )}

      {block.type === "Text" && (
        <>
          <Field label="النص">
            <TextareaWithVariables
              value={String(props.text ?? "")}
              onChange={(v) => update({ props: { text: v } })}
              rows={6}
            />
          </Field>
          <Field label="تفعيل Markdown">
            <Select
              value={String(props.markdown ?? "false")}
              onValueChange={(v) => update({ props: { markdown: v === "true" } })}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">نص عادي</SelectItem>
                <SelectItem value="true">Markdown — يدعم **bold** و _italic_ و [link]()</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <FontFamilyField value={style.fontFamily as string | undefined} onChange={(v) => update({ style: { fontFamily: v || undefined } })} />
          <NumberField
            label="حجم الخط (px)"
            value={Number(style.fontSize ?? 16)}
            min={10}
            max={48}
            onChange={(v) => update({ style: { fontSize: v } })}
          />
          <Field label="السمك">
            <Select
              value={String(style.fontWeight ?? "normal")}
              onValueChange={(v) => update({ style: { fontWeight: v } })}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">عادي</SelectItem>
                <SelectItem value="bold">ثقيل</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <ColorField label="لون النص" value={String(style.color ?? "#374151")} onChange={(v) => update({ style: { color: v } })} />
          <ColorField
            label="لون الخلفية"
            value={String(style.backgroundColor ?? "")}
            allowEmpty
            onChange={(v) => update({ style: { backgroundColor: v || undefined } })}
          />
          <AlignField value={String(style.textAlign ?? "right")} onChange={(v) => update({ style: { textAlign: v } })} />
        </>
      )}

      {block.type === "Button" && (
        <>
          <Field label="نص الزر">
            <Input
              value={String(props.text ?? "")}
              onChange={(e) => update({ props: { text: e.target.value } })}
            />
          </Field>
          <Field label="الرابط">
            <Input
              value={String(props.url ?? "")}
              onChange={(e) => update({ props: { url: e.target.value } })}
              placeholder="https://"
              dir="ltr"
            />
          </Field>
          <Field label="الشكل">
            <Select
              value={String(props.buttonStyle ?? "rectangle")}
              onValueChange={(v) => update({ props: { buttonStyle: v } })}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rectangle">مستطيل</SelectItem>
                <SelectItem value="rounded">دائري الزوايا</SelectItem>
                <SelectItem value="pill">حبة دواء</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="الحجم">
            <Select
              value={String(props.size ?? "medium")}
              onValueChange={(v) => update({ props: { size: v } })}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="x-small">صغير جدًا</SelectItem>
                <SelectItem value="small">صغير</SelectItem>
                <SelectItem value="medium">متوسط</SelectItem>
                <SelectItem value="large">كبير</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="ملء العرض">
            <Select
              value={String(props.fullWidth ?? "false")}
              onValueChange={(v) => update({ props: { fullWidth: v === "true" } })}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">حسب النص</SelectItem>
                <SelectItem value="true">ملء عرض البريد</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <ColorField
            label="لون خلفية الزر"
            value={String(props.buttonBackgroundColor ?? "#FA5D17")}
            onChange={(v) => update({ props: { buttonBackgroundColor: v } })}
          />
          <ColorField
            label="لون نص الزر"
            value={String(props.buttonTextColor ?? "#FFFFFF")}
            onChange={(v) => update({ props: { buttonTextColor: v } })}
          />
          <FontFamilyField value={style.fontFamily as string | undefined} onChange={(v) => update({ style: { fontFamily: v || undefined } })} />
          <NumberField
            label="حجم الخط (px)"
            value={Number(style.fontSize ?? 14)}
            min={10}
            max={32}
            onChange={(v) => update({ style: { fontSize: v } })}
          />
          <Field label="سمك الخط">
            <Select
              value={String(style.fontWeight ?? "bold")}
              onValueChange={(v) => update({ style: { fontWeight: v } })}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">عادي</SelectItem>
                <SelectItem value="bold">ثقيل</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <ColorField
            label="لون خلفية المنطقة"
            value={String(style.backgroundColor ?? "")}
            allowEmpty
            onChange={(v) => update({ style: { backgroundColor: v || undefined } })}
          />
          <AlignField value={String(style.textAlign ?? "center")} onChange={(v) => update({ style: { textAlign: v } })} />
        </>
      )}

      {block.type === "Image" && (
        <>
          <Field label="رابط الصورة">
            <Input
              value={String(props.url ?? "")}
              onChange={(e) => update({ props: { url: e.target.value } })}
              placeholder="https://"
              dir="ltr"
            />
          </Field>
          <Field label="الوصف البديل (alt)">
            <Input
              value={String(props.alt ?? "")}
              onChange={(e) => update({ props: { alt: e.target.value } })}
            />
          </Field>
          <Field label="رابط نقر (اختياري)">
            <Input
              value={String(props.linkHref ?? "")}
              onChange={(e) => update({ props: { linkHref: e.target.value || undefined } })}
              placeholder="https://"
              dir="ltr"
            />
          </Field>
          <Field label="محاذاة الصورة">
            <Select
              value={String(props.contentAlignment ?? "middle")}
              onValueChange={(v) => update({ props: { contentAlignment: v } })}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="top">أعلى</SelectItem>
                <SelectItem value="middle">وسط</SelectItem>
                <SelectItem value="bottom">أسفل</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <NumberField
            label="العرض (px) — اتركه 0 للتلقائي"
            value={Number(props.width ?? 0)}
            min={0}
            max={1200}
            onChange={(v) => update({ props: { width: v || undefined } })}
          />
          <NumberField
            label="الارتفاع (px) — اتركه 0 للتلقائي"
            value={Number(props.height ?? 0)}
            min={0}
            max={1200}
            onChange={(v) => update({ props: { height: v || undefined } })}
          />
          <ColorField
            label="لون الخلفية"
            value={String(style.backgroundColor ?? "")}
            allowEmpty
            onChange={(v) => update({ style: { backgroundColor: v || undefined } })}
          />
        </>
      )}

      {block.type === "Avatar" && (
        <>
          <Field label="رابط الصورة">
            <Input
              value={String(props.imageUrl ?? "")}
              onChange={(e) => update({ props: { imageUrl: e.target.value } })}
              placeholder="https://"
              dir="ltr"
            />
          </Field>
          <Field label="الوصف البديل (alt)">
            <Input
              value={String(props.alt ?? "")}
              onChange={(e) => update({ props: { alt: e.target.value } })}
            />
          </Field>
          <Field label="الشكل">
            <Select
              value={String(props.shape ?? "circle")}
              onValueChange={(v) => update({ props: { shape: v } })}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="circle">دائري</SelectItem>
                <SelectItem value="square">مربع</SelectItem>
                <SelectItem value="rounded">دائري الزوايا</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <NumberField
            label="الحجم (px)"
            value={Number(props.size ?? 64)}
            min={16}
            max={256}
            onChange={(v) => update({ props: { size: v } })}
          />
          <AlignField value={String(style.textAlign ?? "center")} onChange={(v) => update({ style: { textAlign: v } })} />
          <ColorField
            label="لون الخلفية"
            value={String(style.backgroundColor ?? "")}
            allowEmpty
            onChange={(v) => update({ style: { backgroundColor: v || undefined } })}
          />
        </>
      )}

      {block.type === "Divider" && (
        <>
          <ColorField
            label="لون الخط"
            value={String(props.lineColor ?? "#E5E7EB")}
            onChange={(v) => update({ props: { lineColor: v } })}
          />
          <NumberField
            label="السمك (px)"
            value={Number(props.lineHeight ?? 1)}
            min={1}
            max={20}
            onChange={(v) => update({ props: { lineHeight: v } })}
          />
          <ColorField
            label="لون الخلفية"
            value={String(style.backgroundColor ?? "")}
            allowEmpty
            onChange={(v) => update({ style: { backgroundColor: v || undefined } })}
          />
        </>
      )}

      {block.type === "Spacer" && (
        <NumberField
          label="الارتفاع (px)"
          value={Number(props.height ?? 24)}
          min={4}
          max={400}
          onChange={(v) => update({ props: { height: v } })}
        />
      )}

      {block.type === "Html" && (
        <>
          <Field label="كود HTML">
            <TextareaWithVariables
              value={String(props.contents ?? "")}
              onChange={(v) => update({ props: { contents: v } })}
              rows={10}
              dir="ltr"
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
              المتغيّرات تعمل مباشرة داخل أي مكان في الكود. مثال: <code dir="ltr" className="font-mono">{"<p>مرحباً {{user.name}}</p>"}</code>
              <br />يدعم كذلك تكرار البنود: <code dir="ltr" className="font-mono">{"{{#donation.items}}<li>{{campaignTitle}}</li>{{/donation.items}}"}</code>
            </p>
          </Field>
          <FontFamilyField value={style.fontFamily as string | undefined} onChange={(v) => update({ style: { fontFamily: v || undefined } })} />
          <NumberField
            label="حجم الخط (px)"
            value={Number(style.fontSize ?? 14)}
            min={10}
            max={48}
            onChange={(v) => update({ style: { fontSize: v } })}
          />
          <ColorField label="لون النص" value={String(style.color ?? "#374151")} onChange={(v) => update({ style: { color: v } })} />
          <ColorField
            label="لون الخلفية"
            value={String(style.backgroundColor ?? "")}
            allowEmpty
            onChange={(v) => update({ style: { backgroundColor: v || undefined } })}
          />
        </>
      )}

      <PaddingField
        value={(style.padding as Record<string, number>) ?? { top: 16, bottom: 16, right: 24, left: 24 }}
        onChange={(v) => update({ style: { padding: v } })}
      />
    </div>
  );
}

function RootInspector({
  doc,
  onChange,
}: {
  doc: EmailDocument;
  onChange: (d: EmailDocument) => void;
}) {
  const root = getRoot(doc);
  const data = root.data as Record<string, unknown>;

  const update = (patch: Record<string, unknown>) => {
    const next = {
      ...(doc as Record<string, unknown>),
      root: {
        ...(doc.root as object),
        data: { ...data, ...patch },
      },
    } as unknown as EmailDocument;
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground border-b border-border pb-2">إعدادات البريد العامة</p>
      <ColorField label="لون الخلفية الخارجية" value={String(data.backdropColor ?? "#F8F8F8")} onChange={(v) => update({ backdropColor: v })} />
      <ColorField label="لون البطاقة (الجسم)" value={String(data.canvasColor ?? "#FFFFFF")} onChange={(v) => update({ canvasColor: v })} />
      <ColorField label="لون النص الافتراضي" value={String(data.textColor ?? "#242424")} onChange={(v) => update({ textColor: v })} />
      <Field label="الخط الافتراضي">
        <Select
          value={String(data.fontFamily ?? "MODERN_SANS")}
          onValueChange={(v) => update({ fontFamily: v })}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <NumberField
        label="استدارة زوايا البطاقة (px)"
        value={Number(data.borderRadius ?? 0)}
        min={0}
        max={48}
        onChange={(v) => update({ borderRadius: v })}
      />
      <ColorField
        label="لون حدود البطاقة"
        value={String(data.borderColor ?? "")}
        allowEmpty
        onChange={(v) => update({ borderColor: v || undefined })}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  allowEmpty,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  const isEmpty = allowEmpty && !value;
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isEmpty ? "#ffffff" : value}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded border border-border cursor-pointer"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1"
          placeholder={allowEmpty ? "اتركه فارغًا للشفاف" : undefined}
          dir="ltr"
        />
        {allowEmpty && value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
            className="h-9 px-2 text-xs"
          >
            مسح
          </Button>
        )}
      </div>
    </Field>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        dir="ltr"
      />
    </Field>
  );
}

function PaddingField({
  value,
  onChange,
}: {
  value: { top?: number; right?: number; bottom?: number; left?: number };
  onChange: (v: { top: number; right: number; bottom: number; left: number }) => void;
}) {
  const cur = {
    top: value.top ?? 0,
    right: value.right ?? 0,
    bottom: value.bottom ?? 0,
    left: value.left ?? 0,
  };
  const update = (k: "top" | "right" | "bottom" | "left", v: number) =>
    onChange({ ...cur, [k]: v });
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 mb-1.5 block">المسافات الداخلية (px)</label>
      <div className="grid grid-cols-2 gap-2">
        <Input type="number" value={cur.top} onChange={(e) => update("top", Number(e.target.value) || 0)} placeholder="أعلى" dir="ltr" />
        <Input type="number" value={cur.bottom} onChange={(e) => update("bottom", Number(e.target.value) || 0)} placeholder="أسفل" dir="ltr" />
        <Input type="number" value={cur.right} onChange={(e) => update("right", Number(e.target.value) || 0)} placeholder="يمين" dir="ltr" />
        <Input type="number" value={cur.left} onChange={(e) => update("left", Number(e.target.value) || 0)} placeholder="يسار" dir="ltr" />
      </div>
    </div>
  );
}

function AlignField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="المحاذاة">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="right">يمين</SelectItem>
          <SelectItem value="center">وسط</SelectItem>
          <SelectItem value="left">يسار</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}

function FontFamilyField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <Field label="الخط">
      <Select value={value ?? "__inherit__"} onValueChange={(v) => onChange(v === "__inherit__" ? "" : v)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__inherit__">حسب البريد العام</SelectItem>
          {FONT_FAMILIES.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function TextareaWithVariables({
  value,
  onChange,
  rows = 3,
  dir,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  dir?: "ltr" | "rtl";
  className?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const insert = (token: string) => {
    const el = ref.current;
    if (!el) {
      onChange(value + token);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };
  return (
    <div className="space-y-1.5">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        dir={dir}
        className={className ?? "font-mono text-xs"}
      />
      <details className="group">
        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">إدراج متغيّر</summary>
        <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-border bg-slate-50/60 p-2 space-y-2">
          {VARIABLE_CATALOG.map((g) => (
            <div key={g.group}>
              <div className="text-[10px] font-semibold text-slate-500 mb-1">{g.group}</div>
              <div className="flex flex-wrap gap-1">
                {g.entries.map((e) => (
                  <button
                    key={e.token}
                    type="button"
                    onClick={() => insert(e.token)}
                    className="text-[11px] font-mono px-2 py-0.5 rounded bg-white border border-border hover:bg-blue-50"
                    title={e.label}
                  >
                    {e.token}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
