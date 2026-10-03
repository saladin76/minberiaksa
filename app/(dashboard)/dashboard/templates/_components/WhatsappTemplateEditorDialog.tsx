"use client";

import * as React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  MessageCircle,
  Megaphone,
  Bell,
  KeyRound,
  Image as ImageIcon,
  Video,
  FileText,
  MapPin,
  Type,
  Plus,
  Trash2,
  Bold,
  Italic,
  Strikethrough,
  Code2,
  Upload,
  Loader2,
  Link2,
  Phone,
  Reply,
} from "lucide-react";
import { mergeText } from "@/lib/templates/variables";
import { SAMPLE_TEMPLATE_CONTEXT } from "@/lib/templates/sample-context";
import { SUPPORTED_LOCALES, LOCALE_LABELS, DEFAULT_LOCALE, type SupportedLocale } from "@/lib/locales";
import { TemplateDialogShell, LocaleStrip, FieldLabel } from "./TemplateDialogShell";
import { VariablePicker } from "./VariablePicker";
import { cn } from "@/lib/utils";

interface Props {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Category = "MARKETING" | "UTILITY" | "AUTHENTICATION";
type HeaderType = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
type ButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

type StudioButton = {
  type: ButtonType;
  text: string;
  url?: string;
  phoneNumber?: string;
  example?: string;
};

type LocaleDraft = {
  body: string;
  headerText: string;
  footerText: string;
  buttons: StudioButton[];
};

type HeaderDraft = {
  type: HeaderType;
  exampleHandle?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
};

type AuthenticationDraft = {
  addSecurityRecommendation: boolean;
  codeExpirationMinutes: number;
  otpType: "COPY_CODE" | "ONE_TAP";
  buttonText: string;
  autofillText: string;
  packageName: string;
  signatureHash: string;
};

interface ApiTemplate {
  id: string;
  name: string;
  body: string;
  category?: Category | null;
  header?: (HeaderDraft & { text?: string | null }) | null;
  footerText?: string | null;
  buttons?: StudioButton[] | null;
  authentication?: Partial<AuthenticationDraft> | null;
  translations?: Partial<Record<string, Partial<LocaleDraft>>> | null;
}

const emptyLocale = (): LocaleDraft => ({ body: "", headerText: "", footerText: "", buttons: [] });
const defaultAuth = (): AuthenticationDraft => ({
  addSecurityRecommendation: true,
  codeExpirationMinutes: 10,
  otpType: "COPY_CODE",
  buttonText: "Copy Code",
  autofillText: "Autofill",
  packageName: "",
  signatureHash: "",
});

const CATEGORY_OPTIONS: Array<{ value: Category; label: string; hint: string; icon: React.ReactNode }> = [
  { value: "MARKETING", label: "Marketing", hint: "حملات وعروض وإعادة تفاعل", icon: <Megaphone className="h-4 w-4" /> },
  { value: "UTILITY", label: "Utility", hint: "تبرعات ومدفوعات وخدمة", icon: <Bell className="h-4 w-4" /> },
  { value: "AUTHENTICATION", label: "Authentication", hint: "رموز OTP والتحقق", icon: <KeyRound className="h-4 w-4" /> },
];

const HEADER_OPTIONS: Array<{ value: HeaderType; label: string; icon: React.ReactNode }> = [
  { value: "NONE", label: "بدون", icon: <Type className="h-4 w-4" /> },
  { value: "TEXT", label: "نص", icon: <Type className="h-4 w-4" /> },
  { value: "IMAGE", label: "صورة", icon: <ImageIcon className="h-4 w-4" /> },
  { value: "VIDEO", label: "فيديو", icon: <Video className="h-4 w-4" /> },
  { value: "DOCUMENT", label: "مستند", icon: <FileText className="h-4 w-4" /> },
  { value: "LOCATION", label: "موقع", icon: <MapPin className="h-4 w-4" /> },
];

function cloneButtons(buttons: StudioButton[]): StudioButton[] {
  return buttons.map((button) => ({ ...button }));
}

function buttonIcon(type: ButtonType) {
  if (type === "URL") return <Link2 className="h-3.5 w-3.5" />;
  if (type === "PHONE_NUMBER") return <Phone className="h-3.5 w-3.5" />;
  return <Reply className="h-3.5 w-3.5" />;
}

function mediaAccept(type: HeaderType): string | undefined {
  if (type === "IMAGE") return "image/jpeg,image/png";
  if (type === "VIDEO") return "video/mp4";
  if (type === "DOCUMENT") return "application/pdf";
  return undefined;
}

export function WhatsappTemplateEditorDialog({ id, open, onOpenChange }: Props) {
  const [name, setName] = React.useState("");
  const [workingId, setWorkingId] = React.useState<string | null>(id);
  const [category, setCategory] = React.useState<Category>("UTILITY");
  const [header, setHeader] = React.useState<HeaderDraft>({ type: "NONE" });
  const [locales, setLocales] = React.useState<Partial<Record<SupportedLocale, LocaleDraft>>>({});
  const [authentication, setAuthentication] = React.useState<AuthenticationDraft>(defaultAuth());
  const [activeLocale, setActiveLocale] = React.useState<SupportedLocale>(DEFAULT_LOCALE);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [uploadingSample, setUploadingSample] = React.useState(false);
  const [mediaPreview, setMediaPreview] = React.useState<string | null>(null);
  const [insertTarget, setInsertTarget] = React.useState<"body" | "header">("body");
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const headerRef = React.useRef<HTMLInputElement>(null);

  const current = locales[activeLocale] ?? emptyLocale();

  React.useEffect(() => {
    if (!open) return;
    setWorkingId(id);
    setMediaPreview(null);
    if (!id) {
      setName("");
      setCategory("UTILITY");
      setHeader({ type: "NONE" });
      setLocales({
        [DEFAULT_LOCALE]: {
          body: "مرحباً {{user.name}}، شكراً لتبرّعك!",
          headerText: "",
          footerText: "",
          buttons: [],
        },
      });
      setAuthentication(defaultAuth());
      setActiveLocale(DEFAULT_LOCALE);
      return;
    }

    setLoading(true);
    axios
      .get(`/api/templates/whatsapp/${id}`)
      .then((res) => {
        const template = res.data?.template as ApiTemplate;
        setName(template?.name ?? "");
        setCategory(template?.category === "MARKETING" || template?.category === "AUTHENTICATION" ? template.category : "UTILITY");
        setHeader({
          type: (template?.header?.type as HeaderType) ?? "NONE",
          exampleHandle: template?.header?.exampleHandle ?? null,
          fileName: template?.header?.fileName ?? null,
          mimeType: template?.header?.mimeType ?? null,
          latitude: template?.header?.latitude ?? null,
          longitude: template?.header?.longitude ?? null,
          address: template?.header?.address ?? null,
        });

        const arabic: LocaleDraft = {
          body: template?.body ?? "",
          headerText: template?.header?.text ?? "",
          footerText: template?.footerText ?? "",
          buttons: cloneButtons(Array.isArray(template?.buttons) ? template.buttons : []),
        };
        const next: Partial<Record<SupportedLocale, LocaleDraft>> = { [DEFAULT_LOCALE]: arabic };
        if (template?.translations) {
          for (const [locale, value] of Object.entries(template.translations)) {
            if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale) || locale === DEFAULT_LOCALE || !value?.body) continue;
            next[locale as SupportedLocale] = {
              body: value.body ?? "",
              headerText: value.headerText ?? arabic.headerText,
              footerText: value.footerText ?? arabic.footerText,
              buttons: cloneButtons(value.buttons ?? arabic.buttons),
            };
          }
        }
        setLocales(next);
        setAuthentication({ ...defaultAuth(), ...(template?.authentication ?? {}) });
        setActiveLocale(DEFAULT_LOCALE);
      })
      .catch(() => toast.error("فشل تحميل القالب"))
      .finally(() => setLoading(false));
  }, [id, open]);

  React.useEffect(() => () => {
    if (mediaPreview?.startsWith("blob:")) URL.revokeObjectURL(mediaPreview);
  }, [mediaPreview]);

  const setCurrent = React.useCallback((patch: Partial<LocaleDraft>) => {
    setLocales((previous) => ({
      ...previous,
      [activeLocale]: { ...(previous[activeLocale] ?? emptyLocale()), ...patch },
    }));
  }, [activeLocale]);

  const enableLocale = (locale: SupportedLocale) => {
    setLocales((previous) => {
      if (previous[locale]) return previous;
      const source = previous[DEFAULT_LOCALE] ?? emptyLocale();
      return { ...previous, [locale]: { ...source, buttons: cloneButtons(source.buttons) } };
    });
    setActiveLocale(locale);
  };

  const removeLocale = (locale: SupportedLocale) => {
    if (locale === DEFAULT_LOCALE) return;
    setLocales((previous) => {
      const next = { ...previous };
      delete next[locale];
      return next;
    });
    setActiveLocale(DEFAULT_LOCALE);
  };

  const uploadSample = async (file: File) => {
    setUploadingSample(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await axios.post("/api/templates/whatsapp/media-sample", form);
      const handle = response.data?.handle as string | undefined;
      if (!handle) throw new Error("missing handle");
      if (mediaPreview?.startsWith("blob:")) URL.revokeObjectURL(mediaPreview);
      setMediaPreview(URL.createObjectURL(file));
      setHeader((previous) => ({
        ...previous,
        exampleHandle: handle,
        fileName: file.name,
        mimeType: file.type,
      }));
      toast.success("تم رفع عينة الوسائط إلى Meta بنجاح");
    } catch (error) {
      const detail = (error as { response?: { data?: { error?: string; detail?: string } } }).response?.data;
      toast.error([detail?.error, detail?.detail].filter(Boolean).join(" — ") || "فشل رفع عينة الوسائط إلى Meta");
    } finally {
      setUploadingSample(false);
    }
  };

  const insertToken = (token: string) => {
    if (insertTarget === "header" && header.type === "TEXT") {
      const element = headerRef.current;
      const value = current.headerText;
      const start = element?.selectionStart ?? value.length;
      const end = element?.selectionEnd ?? value.length;
      setCurrent({ headerText: value.slice(0, start) + token + value.slice(end) });
      requestAnimationFrame(() => {
        headerRef.current?.focus();
        const pos = start + token.length;
        headerRef.current?.setSelectionRange(pos, pos);
      });
      return;
    }
    const element = bodyRef.current;
    const value = current.body;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    setCurrent({ body: value.slice(0, start) + token + value.slice(end) });
    requestAnimationFrame(() => {
      bodyRef.current?.focus();
      const pos = start + token.length;
      bodyRef.current?.setSelectionRange(pos, pos);
    });
  };

  const wrapSelection = (before: string, after = before) => {
    const element = bodyRef.current;
    if (!element) return;
    const value = current.body;
    const start = element.selectionStart ?? value.length;
    const end = element.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || "نص";
    setCurrent({ body: value.slice(0, start) + before + selected + after + value.slice(end) });
    requestAnimationFrame(() => element.focus());
  };

  const addButton = (type: ButtonType) => {
    if (current.buttons.length >= 10) {
      toast.error("الحد الأقصى 10 أزرار");
      return;
    }
    setCurrent({
      buttons: [
        ...current.buttons,
        type === "URL"
          ? { type, text: "زيارة الموقع", url: "https://minberiaksa.org" }
          : type === "PHONE_NUMBER"
            ? { type, text: "اتصل بنا", phoneNumber: "+90" }
            : { type, text: "رد سريع" },
      ],
    });
  };

  const updateButton = (index: number, patch: Partial<StudioButton>) => {
    const buttons = cloneButtons(current.buttons);
    buttons[index] = { ...buttons[index], ...patch };
    setCurrent({ buttons });
  };

  const removeButton = (index: number) => {
    setCurrent({ buttons: current.buttons.filter((_, position) => position !== index) });
  };

  const save = async () => {
    const arabic = locales[DEFAULT_LOCALE] ?? emptyLocale();
    if (!name.trim()) return void toast.error("اسم القالب مطلوب");
    if (!/^[a-z][a-z0-9_]{0,119}$/.test(name)) return void toast.error("اسم Meta يجب أن يبدأ بحرف ويحتوي حروفًا إنجليزية صغيرة وأرقامًا وشرطة سفلية فقط");
    if (category !== "AUTHENTICATION" && !arabic.body.trim()) return void toast.error("نص القالب بالعربية مطلوب");
    if (category !== "AUTHENTICATION" && ["IMAGE", "VIDEO", "DOCUMENT"].includes(header.type) && !header.exampleHandle) {
      return void toast.error("ارفع عينة الوسائط إلى Meta أولًا");
    }
    if (category === "AUTHENTICATION" && authentication.otpType === "ONE_TAP" && (!authentication.packageName || !authentication.signatureHash)) {
      return void toast.error("One Tap يحتاج Package Name وSignature Hash");
    }

    setSaving(true);
    try {
      const translations: Record<string, LocaleDraft> = {};
      for (const locale of SUPPORTED_LOCALES) {
        if (locale === DEFAULT_LOCALE) continue;
        const draft = locales[locale];
        if (draft?.body.trim()) translations[locale] = draft;
      }

      const payload = {
        name,
        body: category === "AUTHENTICATION" ? "Authentication code" : arabic.body.trim(),
        translations: Object.keys(translations).length ? translations : null,
        metaCategory: category,
        header: {
          ...header,
          text: header.type === "TEXT" ? arabic.headerText.trim() : null,
        },
        footerText: category === "AUTHENTICATION" ? null : arabic.footerText.trim() || null,
        buttons: category === "AUTHENTICATION" ? [] : arabic.buttons,
        authentication: category === "AUTHENTICATION" ? authentication : null,
      };

      const response = workingId
        ? await axios.patch(`/api/templates/whatsapp/${workingId}`, payload)
        : await axios.post("/api/templates/whatsapp", payload);
      const publish = response.data?.publish as { targets?: number } | undefined;
      toast.success(`تم إنشاء القالب وإرساله إلى Meta للمراجعة${publish?.targets ? ` (${publish.targets} نسخة WABA/لغة)` : ""}`);
      onOpenChange(false);
    } catch (error) {
      const data = (error as {
        response?: {
          data?: {
            error?: string;
            saved?: boolean;
            template?: { id?: string };
            publish?: { errors?: Array<{ reason?: string; detail?: string }> };
          };
        };
      }).response?.data;
      if (data?.saved && data.template?.id) setWorkingId(data.template.id);
      const provider = data?.publish?.errors?.[0];
      toast.error([data?.error, provider?.reason, provider?.detail].filter(Boolean).join(" — ") || "فشل حفظ القالب");
    } finally {
      setSaving(false);
    }
  };

  const previewBody = React.useMemo(
    () => category === "AUTHENTICATION"
      ? "رمز التحقق الخاص بك هو 123456\nلا تشارك هذا الرمز مع أي شخص."
      : mergeText(current.body, SAMPLE_TEMPLATE_CONTEXT),
    [category, current.body],
  );
  const previewHeader = React.useMemo(
    () => mergeText(current.headerText, SAMPLE_TEMPLATE_CONTEXT),
    [current.headerText],
  );

  return (
    <TemplateDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={id ? "استوديو قالب واتساب" : "إنشاء قالب واتساب"}
      subtitle="منشئ متوافق مع Meta: يبني القالب، يرفع عينة الوسائط، وينشر تلقائيًا إلى كل WABA نشط مرتبط."
      icon={<MessageCircle className="h-4 w-4" />}
      accent="whatsapp"
      size="full"
      loading={loading}
      onCancel={() => onOpenChange(false)}
      onSave={save}
      saving={saving}
      saveDisabled={uploadingSample}
      saveLabel="حفظ وإرسال إلى Meta"
      toolbar={
        category === "AUTHENTICATION" ? undefined : (
          <LocaleStrip
            accent="whatsapp"
            enabled={(locale) => Boolean(locales[locale])}
            activeLocale={activeLocale}
            onSelect={setActiveLocale}
            onEnable={enableLocale}
            onRemove={removeLocale}
          />
        )
      }
    >
      <div className="space-y-5">
        <section className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="grid grid-cols-1 md:grid-cols-3">
            {CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setCategory(option.value)}
                className={cn(
                  "flex items-center justify-center gap-2 border-b p-3 text-sm transition-colors md:border-b-0 md:border-e",
                  category === option.value
                    ? "bg-slate-800 font-semibold text-white"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100",
                )}
              >
                {option.icon}
                <span>{option.label}</span>
                <span className={cn("hidden text-[10px] lg:inline", category === option.value ? "text-white/70" : "text-slate-400")}>
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-white p-4 lg:grid-cols-[1fr_260px]">
          <div className="space-y-1.5">
            <FieldLabel hint="اسم Provider ثابت بعد الإرسال">اسم القالب</FieldLabel>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              placeholder="donation_success"
              dir="ltr"
              maxLength={120}
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>حروف a-z وأرقام و _ فقط</span>
              <span>{name.length}/120</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>اللغة الحالية</FieldLabel>
            <div className="flex h-10 items-center rounded-md border border-border bg-slate-50 px-3 text-sm">
              {category === "AUTHENTICATION" ? "تحددها Meta حسب قالب التحقق" : LOCALE_LABELS[activeLocale]}
            </div>
          </div>
        </section>

        {category === "AUTHENTICATION" ? (
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-4 rounded-xl border border-border bg-white p-4">
              <h3 className="font-semibold text-slate-800">إعدادات Authentication</h3>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={authentication.addSecurityRecommendation}
                  onChange={(event) => setAuthentication((prev) => ({ ...prev, addSecurityRecommendation: event.target.checked }))}
                />
                إضافة تنبيه أمني بعدم مشاركة الرمز
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <FieldLabel>انتهاء الرمز بالدقائق</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={authentication.codeExpirationMinutes}
                    onChange={(event) => setAuthentication((prev) => ({ ...prev, codeExpirationMinutes: Number(event.target.value) || 10 }))}
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>نوع زر OTP</FieldLabel>
                  <select
                    value={authentication.otpType}
                    onChange={(event) => setAuthentication((prev) => ({ ...prev, otpType: event.target.value as "COPY_CODE" | "ONE_TAP" }))}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="COPY_CODE">Copy Code</option>
                    <option value="ONE_TAP">One Tap Autofill</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <FieldLabel>نص الزر</FieldLabel>
                <Input value={authentication.buttonText} onChange={(event) => setAuthentication((prev) => ({ ...prev, buttonText: event.target.value }))} maxLength={25} />
              </div>
              {authentication.otpType === "ONE_TAP" && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1"><FieldLabel>Package Name</FieldLabel><Input dir="ltr" value={authentication.packageName} onChange={(e) => setAuthentication((p) => ({ ...p, packageName: e.target.value }))} /></div>
                  <div className="space-y-1"><FieldLabel>Signature Hash</FieldLabel><Input dir="ltr" value={authentication.signatureHash} onChange={(e) => setAuthentication((p) => ({ ...p, signatureHash: e.target.value }))} /></div>
                  <div className="space-y-1 md:col-span-2"><FieldLabel>Autofill Text</FieldLabel><Input value={authentication.autofillText} onChange={(e) => setAuthentication((p) => ({ ...p, autofillText: e.target.value }))} /></div>
                </div>
              )}
            </div>
            <WhatsappPreview
              header=""
              body={previewBody}
              footer={`ينتهي الرمز خلال ${authentication.codeExpirationMinutes} دقيقة`}
              buttons={[{ type: "QUICK_REPLY", text: authentication.buttonText }]}
              headerType="NONE"
              mediaPreview={null}
            />
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="min-w-0 space-y-4">
              <section className="space-y-4 rounded-xl border border-border bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-800">المحتوى</h3>
                    <p className="text-[11px] text-slate-400">Header + Body + Footer + Buttons بنفس بنية Meta</p>
                  </div>
                  <span className="rounded-full bg-[#25D366]/10 px-2.5 py-1 text-[10px] font-semibold text-[#128C7E]">
                    {LOCALE_LABELS[activeLocale]}
                  </span>
                </div>

                <div className="space-y-2">
                  <FieldLabel hint="اختياري">Header</FieldLabel>
                  <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                    {HEADER_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setHeader((previous) => ({ ...previous, type: option.value, ...(option.value === "NONE" ? { exampleHandle: null } : {}) }));
                          setInsertTarget(option.value === "TEXT" ? "header" : "body");
                        }}
                        className={cn(
                          "flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-2 text-xs",
                          header.type === option.value
                            ? "border-[#25D366] bg-[#25D366]/10 text-[#128C7E]"
                            : "border-border bg-slate-50 text-slate-600 hover:bg-slate-100",
                        )}
                      >
                        {option.icon}{option.label}
                      </button>
                    ))}
                  </div>

                  {header.type === "TEXT" && (
                    <div className="space-y-1">
                      <Input
                        ref={headerRef}
                        value={current.headerText}
                        onFocus={() => setInsertTarget("header")}
                        onChange={(event) => setCurrent({ headerText: event.target.value })}
                        placeholder="عنوان الرسالة"
                        maxLength={60}
                        dir={activeLocale === "ar" ? "rtl" : "ltr"}
                      />
                      <div className="text-end text-[10px] text-slate-400">{current.headerText.length}/60</div>
                    </div>
                  )}

                  {["IMAGE", "VIDEO", "DOCUMENT"].includes(header.type) && (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                      <label className="flex cursor-pointer items-center justify-center gap-2 text-sm text-slate-600">
                        {uploadingSample ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {header.exampleHandle ? `تم رفع العينة: ${header.fileName ?? "ملف"}` : "ارفع عينة إلى Meta"}
                        <input
                          type="file"
                          className="hidden"
                          accept={mediaAccept(header.type)}
                          disabled={uploadingSample}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadSample(file);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                      <p className="mt-1 text-center text-[10px] text-slate-400">العينة تُرفع مباشرة عبر Meta Resumable Upload وتستخدم كـ header_handle للمراجعة.</p>
                    </div>
                  )}

                  {header.type === "LOCATION" && (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <Input placeholder="Latitude" type="number" value={header.latitude ?? ""} onChange={(e) => setHeader((p) => ({ ...p, latitude: e.target.value ? Number(e.target.value) : null }))} />
                      <Input placeholder="Longitude" type="number" value={header.longitude ?? ""} onChange={(e) => setHeader((p) => ({ ...p, longitude: e.target.value ? Number(e.target.value) : null }))} />
                      <Input placeholder="العنوان للمعاينة" value={header.address ?? ""} onChange={(e) => setHeader((p) => ({ ...p, address: e.target.value }))} />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <FieldLabel hint={`${current.body.length}/1024`}>Body</FieldLabel>
                  <div className="flex flex-wrap gap-1 rounded-t-lg border border-b-0 border-border bg-slate-50 p-1.5">
                    <ToolbarButton title="عريض" onClick={() => wrapSelection("*")}><Bold className="h-3.5 w-3.5" /></ToolbarButton>
                    <ToolbarButton title="مائل" onClick={() => wrapSelection("_")}><Italic className="h-3.5 w-3.5" /></ToolbarButton>
                    <ToolbarButton title="يتوسطه خط" onClick={() => wrapSelection("~")}><Strikethrough className="h-3.5 w-3.5" /></ToolbarButton>
                    <ToolbarButton title="Code" onClick={() => wrapSelection("`")}><Code2 className="h-3.5 w-3.5" /></ToolbarButton>
                    <span className="mx-1 h-7 w-px bg-border" />
                    <button type="button" onClick={() => setInsertTarget("body")} className="rounded px-2 text-[11px] text-slate-600 hover:bg-white">المتغيرات ↓</button>
                  </div>
                  <Textarea
                    ref={bodyRef}
                    value={current.body}
                    maxLength={1024}
                    onFocus={() => setInsertTarget("body")}
                    onChange={(event) => setCurrent({ body: event.target.value })}
                    rows={8}
                    className="rounded-t-none resize-y font-mono text-xs leading-relaxed"
                    dir={activeLocale === "ar" ? "rtl" : "ltr"}
                    placeholder="اكتب نص رسالة واتساب"
                  />
                  <VariablePicker onInsert={insertToken} />
                </div>

                <div className="space-y-1">
                  <FieldLabel hint={`اختياري · ${current.footerText.length}/60`}>Footer</FieldLabel>
                  <Input
                    value={current.footerText}
                    onChange={(event) => setCurrent({ footerText: event.target.value })}
                    maxLength={60}
                    placeholder="سطر قصير أسفل الرسالة"
                    dir={activeLocale === "ar" ? "rtl" : "ltr"}
                  />
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-border bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-800">الأزرار</h3>
                    <p className="text-[11px] text-slate-400">Quick Reply / Website URL / Phone Number — حتى 10 أزرار</p>
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => addButton("QUICK_REPLY")}><Plus className="me-1 h-3.5 w-3.5" />رد سريع</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => addButton("URL")}><Plus className="me-1 h-3.5 w-3.5" />رابط</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => addButton("PHONE_NUMBER")}><Plus className="me-1 h-3.5 w-3.5" />هاتف</Button>
                  </div>
                </div>
                {current.buttons.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">لا توجد أزرار</div>
                ) : (
                  <div className="space-y-2">
                    {current.buttons.map((button, index) => (
                      <div key={index} className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-slate-50 p-3 md:grid-cols-[130px_1fr_1.5fr_36px]">
                        <div className="flex h-10 items-center gap-1 rounded-md border bg-white px-2 text-xs">{buttonIcon(button.type)}{button.type}</div>
                        <Input value={button.text} maxLength={25} onChange={(e) => updateButton(index, { text: e.target.value })} placeholder="نص الزر" />
                        {button.type === "URL" ? (
                          <Input dir="ltr" value={button.url ?? ""} onChange={(e) => updateButton(index, { url: e.target.value })} placeholder="https://... أو {{variable}}" />
                        ) : button.type === "PHONE_NUMBER" ? (
                          <Input dir="ltr" value={button.phoneNumber ?? ""} onChange={(e) => updateButton(index, { phoneNumber: e.target.value })} placeholder="+905..." />
                        ) : (
                          <div className="flex h-10 items-center rounded-md border bg-white px-3 text-xs text-slate-400">لا يحتاج قيمة إضافية</div>
                        )}
                        <button type="button" onClick={() => removeButton(index)} className="grid h-10 w-9 place-items-center rounded-md text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <WhatsappPreview
              header={previewHeader}
              body={previewBody}
              footer={current.footerText}
              buttons={current.buttons}
              headerType={header.type}
              mediaPreview={mediaPreview}
              fileName={header.fileName ?? undefined}
              address={header.address ?? undefined}
            />
          </div>
        )}
      </div>
    </TemplateDialogShell>
  );
}

function ToolbarButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={title} onClick={onClick} className="grid h-7 w-7 place-items-center rounded text-slate-600 hover:bg-white hover:text-slate-900">{children}</button>;
}

function WhatsappPreview({
  header,
  body,
  footer,
  buttons,
  headerType,
  mediaPreview,
  fileName,
  address,
}: {
  header: string;
  body: string;
  footer: string;
  buttons: StudioButton[];
  headerType: HeaderType;
  mediaPreview: string | null;
  fileName?: string;
  address?: string;
}) {
  return (
    <aside className="min-w-0 xl:sticky xl:top-0 xl:self-start">
      <FieldLabel hint="بيانات تجريبية">المعاينة الحية</FieldLabel>
      <div className="mt-2 min-h-[520px] rounded-2xl border border-border bg-[#E5DDD5] p-5">
        <div className="mx-auto max-w-[360px] overflow-hidden rounded-xl bg-white shadow-sm">
          {headerType === "IMAGE" && mediaPreview && <img src={mediaPreview} alt="" className="h-48 w-full object-cover" />}
          {headerType === "VIDEO" && mediaPreview && <video src={mediaPreview} controls className="h-48 w-full bg-black object-contain" />}
          {headerType === "DOCUMENT" && (
            <div className="flex items-center gap-3 bg-slate-100 p-4"><FileText className="h-7 w-7 text-red-500" /><span className="truncate text-xs">{fileName ?? "document.pdf"}</span></div>
          )}
          {headerType === "LOCATION" && (
            <div className="flex min-h-28 items-center justify-center gap-2 bg-slate-100 p-4 text-xs text-slate-600"><MapPin className="h-5 w-5" />{address || "موقع جغرافي"}</div>
          )}
          <div className="space-y-2 p-3" dir="auto">
            {headerType === "TEXT" && header && <div className="font-semibold text-slate-900">{header}</div>}
            <div className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{body || <span className="italic text-slate-400">المعاينة ستظهر هنا</span>}</div>
            {footer && <div className="text-[11px] text-slate-400">{footer}</div>}
          </div>
          {buttons.length > 0 && (
            <div className="border-t border-slate-100">
              {buttons.map((button, index) => (
                <div key={index} className="flex items-center justify-center gap-1.5 border-b border-slate-100 px-3 py-2.5 text-xs font-medium text-sky-600 last:border-b-0">
                  {buttonIcon(button.type)}{button.text || "زر"}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
