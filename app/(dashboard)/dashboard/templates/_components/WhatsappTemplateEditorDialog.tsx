"use client";

import * as React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle } from "lucide-react";
import { mergeText } from "@/lib/templates/variables";
import { SAMPLE_TEMPLATE_CONTEXT } from "@/lib/templates/sample-context";
import { SUPPORTED_LOCALES, LOCALE_LABELS, DEFAULT_LOCALE, type SupportedLocale } from "@/lib/locales";
import { TemplateDialogShell, LocaleStrip, FieldLabel } from "./TemplateDialogShell";
import { VariablePicker } from "./VariablePicker";

interface Props {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type BodiesState = Partial<Record<SupportedLocale, string>>;

interface ApiTemplate {
  id: string;
  name: string;
  body: string;
  translations?: Partial<Record<string, { body?: string }>> | null;
}

export function WhatsappTemplateEditorDialog({ id, open, onOpenChange }: Props) {
  const [name, setName] = React.useState("");
  const [bodies, setBodies] = React.useState<BodiesState>({});
  const [activeLocale, setActiveLocale] = React.useState<SupportedLocale>(DEFAULT_LOCALE);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!open) return;
    if (!id) {
      setName("");
      setBodies({ [DEFAULT_LOCALE]: "مرحباً {{user.name}}، شكراً لتبرّعك!" });
      setActiveLocale(DEFAULT_LOCALE);
      return;
    }
    setLoading(true);
    axios
      .get(`/api/templates/whatsapp/${id}`)
      .then((res) => {
        const t = res.data?.template as ApiTemplate;
        setName(t?.name ?? "");
        const next: BodiesState = { [DEFAULT_LOCALE]: t?.body ?? "" };
        if (t?.translations) {
          for (const [loc, v] of Object.entries(t.translations)) {
            if (!v?.body) continue;
            if (!SUPPORTED_LOCALES.includes(loc as SupportedLocale)) continue;
            if (loc === DEFAULT_LOCALE) continue;
            next[loc as SupportedLocale] = v.body;
          }
        }
        setBodies(next);
        setActiveLocale(DEFAULT_LOCALE);
      })
      .catch(() => toast.error("فشل تحميل القالب"))
      .finally(() => setLoading(false));
  }, [id, open]);

  const currentBody = bodies[activeLocale] ?? "";

  const updateCurrentBody = (v: string) => {
    setBodies((prev) => ({ ...prev, [activeLocale]: v }));
  };

  const enableLocale = (loc: SupportedLocale) => {
    setBodies((prev) => {
      if (prev[loc] != null) return prev;
      return { ...prev, [loc]: prev[DEFAULT_LOCALE] ?? "" };
    });
    setActiveLocale(loc);
  };

  const removeLocale = (loc: SupportedLocale) => {
    if (loc === DEFAULT_LOCALE) return;
    setBodies((prev) => {
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
    const arBody = bodies[DEFAULT_LOCALE]?.trim();
    if (!arBody) {
      toast.error("المحتوى بالعربية مطلوب");
      return;
    }
    setSaving(true);
    try {
      const translations: Record<string, { body: string }> = {};
      for (const loc of SUPPORTED_LOCALES) {
        if (loc === DEFAULT_LOCALE) continue;
        const b = bodies[loc]?.trim();
        if (b) translations[loc] = { body: b };
      }
      const payload = {
        name,
        body: arBody,
        translations: Object.keys(translations).length > 0 ? translations : null,
      };
      if (id) {
        await axios.patch(`/api/templates/whatsapp/${id}`, payload);
      } else {
        await axios.post("/api/templates/whatsapp", payload);
      }
      toast.success("تم الحفظ");
      onOpenChange(false);
    } catch {
      toast.error("فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const insertToken = (token: string) => {
    const el = bodyRef.current;
    if (!el) {
      updateCurrentBody(currentBody + token);
      return;
    }
    const start = el.selectionStart ?? currentBody.length;
    const end = el.selectionEnd ?? currentBody.length;
    const next = currentBody.slice(0, start) + token + currentBody.slice(end);
    updateCurrentBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const preview = React.useMemo(() => mergeText(currentBody, SAMPLE_TEMPLATE_CONTEXT), [currentBody]);

  return (
    <TemplateDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={id ? "تعديل قالب الواتساب" : "قالب واتساب جديد"}
      subtitle="نص الرسالة ومتغيّراتها — المعاينة على اليسار تعرضه ببيانات تجريبية."
      icon={<MessageCircle className="h-4 w-4" />}
      accent="whatsapp"
      size="lg"
      loading={loading}
      onCancel={() => onOpenChange(false)}
      onSave={save}
      saving={saving}
      toolbar={
        <LocaleStrip
          accent="whatsapp"
          enabled={(loc) => bodies[loc] != null}
          activeLocale={activeLocale}
          onSelect={setActiveLocale}
          onEnable={enableLocale}
          onRemove={removeLocale}
        />
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <FieldLabel hint="لا يظهر للمتبرّع">اسم القالب</FieldLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: شكر التبرع" />
        </div>

        {/* min-w-0 on both columns keeps the monospace textarea and the preview from widening
            the grid track instead of wrapping. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <div className="space-y-1.5">
              <FieldLabel hint={LOCALE_LABELS[activeLocale]}>المحتوى</FieldLabel>
              <Textarea
                ref={bodyRef}
                value={currentBody}
                onChange={(e) => updateCurrentBody(e.target.value)}
                rows={9}
                className="resize-y font-mono text-xs leading-relaxed"
                dir={activeLocale === "ar" ? "rtl" : "ltr"}
                placeholder="اكتب رسالة الواتساب هنا"
              />
            </div>
            <VariablePicker onInsert={insertToken} />
          </div>

          <div className="min-w-0 space-y-1.5">
            <FieldLabel hint="ببيانات تجريبية">المعاينة</FieldLabel>
            <div className="min-h-[300px] rounded-xl border border-border bg-[#E5DDD5] p-4">
              <div
                className="max-w-full whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-sm shadow-sm"
                dir={activeLocale === "ar" ? "rtl" : "ltr"}
              >
                {preview || <span className="italic text-muted-foreground">المعاينة ستظهر هنا</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </TemplateDialogShell>
  );
}
