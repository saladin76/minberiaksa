"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Loader2, Mail } from "lucide-react";
import type { EmailDocument } from "@/components/email-builder";
import { defaultDocument } from "@/components/email-builder";
import { SUPPORTED_LOCALES, LOCALE_LABELS, DEFAULT_LOCALE, type SupportedLocale } from "@/lib/locales";
import { TemplateDialogShell, LocaleStrip, FieldLabel } from "./TemplateDialogShell";

const EmailEditor = dynamic(
  () => import("@/components/email-builder").then((m) => m.EmailEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-[60vh] flex items-center justify-center text-sm text-muted-foreground">
        جاري تحميل المحرر…
      </div>
    ),
  }
);

interface Props {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Variant = { subject: string; document: EmailDocument };
type VariantsState = Partial<Record<SupportedLocale, Variant>>;

interface ApiTemplate {
  id: string;
  name: string;
  subject: string;
  document: EmailDocument;
  translations?: Partial<Record<string, { subject?: string; document?: EmailDocument }>> | null;
}

export function EmailTemplateEditorDialog({ id, open, onOpenChange }: Props) {
  const [name, setName] = React.useState("");
  const [variants, setVariants] = React.useState<VariantsState>({});
  const [activeLocale, setActiveLocale] = React.useState<SupportedLocale>(DEFAULT_LOCALE);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (!id) {
      setName("");
      setVariants({ [DEFAULT_LOCALE]: { subject: "", document: defaultDocument() } });
      setActiveLocale(DEFAULT_LOCALE);
      return;
    }
    setLoading(true);
    axios
      .get(`/api/templates/email/${id}`)
      .then((res) => {
        const t = res.data?.template as ApiTemplate;
        setName(t?.name ?? "");
        const next: VariantsState = {
          [DEFAULT_LOCALE]: {
            subject: t?.subject ?? "",
            document: (t?.document as EmailDocument) ?? defaultDocument(),
          },
        };
        if (t?.translations) {
          for (const [loc, v] of Object.entries(t.translations)) {
            if (!v) continue;
            if (!SUPPORTED_LOCALES.includes(loc as SupportedLocale)) continue;
            if (loc === DEFAULT_LOCALE) continue;
            const baseDoc = next[DEFAULT_LOCALE]!.document;
            next[loc as SupportedLocale] = {
              subject: v.subject ?? next[DEFAULT_LOCALE]!.subject,
              document: (v.document as EmailDocument) ?? baseDoc,
            };
          }
        }
        setVariants(next);
        setActiveLocale(DEFAULT_LOCALE);
      })
      .catch(() => toast.error("فشل تحميل القالب"))
      .finally(() => setLoading(false));
  }, [id, open]);

  const current = variants[activeLocale];

  const updateCurrent = (patch: Partial<Variant>) => {
    setVariants((prev) => {
      const cur = prev[activeLocale] ?? { subject: "", document: defaultDocument() };
      return { ...prev, [activeLocale]: { ...cur, ...patch } };
    });
  };

  const enableLocale = (loc: SupportedLocale) => {
    setVariants((prev) => {
      if (prev[loc]) return prev;
      const base = prev[DEFAULT_LOCALE] ?? { subject: "", document: defaultDocument() };
      return { ...prev, [loc]: { subject: base.subject, document: base.document } };
    });
    setActiveLocale(loc);
  };

  const removeLocale = (loc: SupportedLocale) => {
    if (loc === DEFAULT_LOCALE) return;
    setVariants((prev) => {
      const next = { ...prev };
      delete next[loc];
      return next;
    });
    setActiveLocale(DEFAULT_LOCALE);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("اسم القالب مطلوب");
      return;
    }
    const arVariant = variants[DEFAULT_LOCALE];
    if (!arVariant?.subject?.trim()) {
      toast.error("الموضوع بالعربية مطلوب");
      return;
    }
    setSaving(true);
    try {
      const translations: Record<string, { subject: string; document: EmailDocument }> = {};
      for (const loc of SUPPORTED_LOCALES) {
        if (loc === DEFAULT_LOCALE) continue;
        const v = variants[loc];
        if (!v) continue;
        translations[loc] = { subject: v.subject, document: v.document };
      }
      const payload = {
        name,
        subject: arVariant.subject,
        document: arVariant.document,
        translations: Object.keys(translations).length > 0 ? translations : null,
      };
      if (id) {
        await axios.patch(`/api/templates/email/${id}`, payload);
      } else {
        await axios.post("/api/templates/email", payload);
      }
      toast.success("تم الحفظ");
      onOpenChange(false);
    } catch {
      toast.error("فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <TemplateDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={id ? "تعديل قالب البريد" : "قالب بريد جديد"}
      icon={<Mail className="h-4 w-4" />}
      size="full"
      onCancel={() => onOpenChange(false)}
      onSave={save}
      saving={saving}
      /* The builder manages its own scrolling and wants every pixel of height, so the body
         drops the shell padding and its scroll container. */
      bodyClassName="overflow-hidden p-3"
      toolbar={
        <>
          {/* Name and subject sit above the canvas rather than inside the header: at full-screen
              width the header row was a third input-wide and the ✕ crowded it. */}
          <div className="grid shrink-0 grid-cols-1 gap-3 border-b border-border px-5 py-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <FieldLabel hint="لا يُرسل">اسم القالب</FieldLabel>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: شكر التبرع الشهري"
                className="h-9"
              />
            </div>
            <div className="min-w-0 space-y-1">
              <FieldLabel hint={LOCALE_LABELS[activeLocale]}>موضوع البريد</FieldLabel>
              <Input
                value={current?.subject ?? ""}
                onChange={(e) => updateCurrent({ subject: e.target.value })}
                placeholder="مرحباً {{user.name}}"
                className="h-9 font-mono text-xs"
                dir={activeLocale === "ar" ? "rtl" : "ltr"}
              />
            </div>
          </div>
          <LocaleStrip
            enabled={(loc) => !!variants[loc]}
            activeLocale={activeLocale}
            onSelect={setActiveLocale}
            onEnable={enableLocale}
            onRemove={removeLocale}
          />
        </>
      }
    >
      {loading || !current ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="me-2 h-6 w-6 animate-spin" /> جاري التحميل…
        </div>
      ) : (
        <EmailEditor
          key={activeLocale}
          value={current.document}
          onChange={(d) => updateCurrent({ document: d })}
        />
      )}
    </TemplateDialogShell>
  );
}
