"use client";

import * as React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Dialog, DialogOverlay, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Loader2, Mail, MessageCircle, Send } from "lucide-react";
import { LOCALE_OPTIONS, isValidLocale, type SupportedLocale } from "@/lib/locales";

const LOCALE_AUTO = "__auto__";

export type SendTarget =
  | { kind: "user"; userId: string }
  | {
      kind: "filtered";
      filters: {
        search?: string;
        preferredLang?: string;
        badgeId?: string;
        gender?: string;
        minAge?: number;
        maxAge?: number;
      };
    };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: "email" | "whatsapp";
  target: SendTarget;
}

interface TemplateRow {
  id: string;
  name: string;
}

export function SendTemplateDialog({ open, onOpenChange, channel, target }: Props) {
  const [templates, setTemplates] = React.useState<TemplateRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = React.useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>("");
  const [localeChoice, setLocaleChoice] = React.useState<string>(LOCALE_AUTO);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewSubject, setPreviewSubject] = React.useState("");
  const [previewHtml, setPreviewHtml] = React.useState("");
  const [previewBody, setPreviewBody] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [recipientCount, setRecipientCount] = React.useState<number | null>(null);

  const apiBase = channel === "email" ? "/api/templates/email" : "/api/templates/whatsapp";
  const channelLabelAr = channel === "email" ? "بريد إلكتروني" : "واتساب";

  React.useEffect(() => {
    if (!open) return;
    setSelectedTemplateId("");
    setLocaleChoice(LOCALE_AUTO);
    setPreviewSubject("");
    setPreviewHtml("");
    setPreviewBody("");
    setRecipientCount(null);

    setTemplatesLoading(true);
    axios
      .get(apiBase)
      .then((res) => setTemplates(res.data?.templates ?? []))
      .catch(() => toast.error("فشل تحميل القوالب"))
      .finally(() => setTemplatesLoading(false));
  }, [open, apiBase]);

  React.useEffect(() => {
    if (!open || target.kind !== "filtered") return;
    const params = new URLSearchParams();
    params.set("scope", "donors");
    params.set("page", "1");
    params.set("limit", "1");
    if (target.filters.search) params.set("search", target.filters.search);
    if (target.filters.preferredLang)
      params.set("preferredLang", target.filters.preferredLang);
    if (target.filters.badgeId) params.set("badgeId", target.filters.badgeId);
    if (target.filters.gender) params.set("gender", target.filters.gender);
    if (target.filters.minAge !== undefined) params.set("minAge", String(target.filters.minAge));
    if (target.filters.maxAge !== undefined) params.set("maxAge", String(target.filters.maxAge));
    axios
      .get(`/api/users?${params}`)
      .then((res) => setRecipientCount(res.data?.pagination?.total ?? 0))
      .catch(() => setRecipientCount(null));
  }, [open, target]);

  React.useEffect(() => {
    if (!open || !selectedTemplateId) return;
    setPreviewLoading(true);
    const userId = target.kind === "user" ? target.userId : undefined;
    const locale = isValidLocale(localeChoice) ? localeChoice : undefined;
    axios
      .post(`${apiBase}/preview`, { templateId: selectedTemplateId, userId, locale })
      .then((res) => {
        if (channel === "email") {
          setPreviewSubject(res.data?.subject ?? "");
          setPreviewHtml(res.data?.html ?? "");
        } else {
          setPreviewBody(res.data?.body ?? "");
        }
      })
      .catch(() => toast.error("فشل تحميل المعاينة"))
      .finally(() => setPreviewLoading(false));
  }, [selectedTemplateId, open, target, apiBase, channel, localeChoice]);

  const send = async () => {
    // WhatsApp sending moved to the Communication Center (Meta Cloud API). The legacy send route is
    // disabled (410), so this dialog never posts WhatsApp — it directs the user there instead.
    if (channel === "whatsapp") {
      toast("تم نقل إرسال واتساب إلى مركز التواصل.");
      return;
    }
    if (!selectedTemplateId) {
      toast.error("اختر قالبًا أولًا");
      return;
    }
    setSending(true);
    try {
      const res = await axios.post(`${apiBase}/send`, {
        templateId: selectedTemplateId,
        target,
        locale: isValidLocale(localeChoice) ? (localeChoice as SupportedLocale) : undefined,
      });
      const { sent, skipped, failed, total } = res.data ?? {};
      const failedCount = Array.isArray(failed) ? failed.length : 0;
      if (sent > 0) {
        toast.success(
          `تم الإرسال — نجح ${sent} من ${total}` +
            (skipped ? `، تخطّي ${skipped}` : "") +
            (failedCount ? `، فشل ${failedCount}` : "")
        );
      } else if (skipped > 0 && failedCount === 0) {
        toast(`لم يتم الإرسال — تخطّي ${skipped} (بيانات ناقصة)`);
      } else {
        toast.error(`فشل الإرسال — ${failedCount} حالة`);
      }
      onOpenChange(false);
    } catch (err) {
      // Defensive: a legacy/disabled route returns 410 with an Arabic message + redirect target.
      if (axios.isAxiosError(err) && err.response?.status === 410) {
        toast.error(err.response.data?.messageAr || "تم نقل الإرسال إلى مركز التواصل.");
      } else {
        toast.error("فشل الإرسال");
      }
    } finally {
      setSending(false);
    }
  };

  const Icon = channel === "email" ? Mail : MessageCircle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogOverlay className="fixed inset-0 bg-black/50" />
      <DialogContent
        className="fixed left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-3xl max-h-[90vh] overflow-y-auto p-6 transform -translate-x-1/2 -translate-y-1/2 border border-border rounded-xl shadow-xl bg-card"
        dir="rtl"
      >
        <DialogTitle className="text-lg font-bold mb-1 flex items-center gap-2">
          <Icon className="w-5 h-5 text-brand" />
          إرسال {channelLabelAr}
        </DialogTitle>
        <p className="text-sm text-muted-foreground mb-4">
          {target.kind === "user"
            ? "سيتم الإرسال إلى المستخدم المحدّد فقط."
            : recipientCount == null
              ? "جارٍ حساب عدد المتبرعين…"
              : `سيتم الإرسال إلى ${recipientCount} متبرع وفق الفلاتر الحالية.`}
        </p>

        {channel === "whatsapp" && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-800">
            {/* This used to link to مركز التواصل under /dashboard/operations, removed with
                التشغيل. The notice still explains why sending is unavailable here; the link is
                dropped because there is no page left to send from. */}
            إرسال واتساب يتم عبر Meta الرسمي بقوالب معتمدة. يمكنك المعاينة هنا فقط.
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">القالب</label>
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
              disabled={templatesLoading}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    templatesLoading
                      ? "جارٍ التحميل…"
                      : templates.length === 0
                        ? "لا توجد قوالب — أنشئ قالبًا من صفحة القوالب"
                        : "اختر قالبًا"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">اللغة (اختياري)</label>
            <Select value={localeChoice} onValueChange={setLocaleChoice}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={LOCALE_AUTO}>تلقائي — حسب اللغة المفضلة لكل مستلم</SelectItem>
                {LOCALE_OPTIONS.map((loc) => (
                  <SelectItem key={loc.code} value={loc.code}>
                    {loc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              في الوضع التلقائي: لكل مستخدم تُختار لغته المفضّلة، وعند غيابها يتم
              استعمال النسخة العربية. إذا لم توجد نسخة باللغة المختارة يتم الرجوع
              تلقائيًا إلى النسخة العربية.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">معاينة</label>
            {!selectedTemplateId ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                اختر قالبًا لعرض المعاينة
              </div>
            ) : previewLoading ? (
              <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                جارٍ التحميل…
              </div>
            ) : channel === "email" ? (
              <div className="rounded-lg border border-border bg-slate-100 p-3" dir="ltr">
                <div className="text-xs text-slate-500 mb-2 px-2 truncate" dir="rtl">
                  <strong>الموضوع:</strong> {previewSubject || "—"}
                </div>
                <iframe
                  srcDoc={previewHtml}
                  title="معاينة البريد"
                  className="w-full h-[40vh] bg-white rounded border border-border"
                  sandbox=""
                />
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-[#E5DDD5] p-4 min-h-[180px]">
                <div className="bg-white rounded-lg p-3 shadow-sm whitespace-pre-wrap text-sm" dir="rtl">
                  {previewBody || (
                    <span className="text-muted-foreground italic">المعاينة فارغة</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              إلغاء
            </Button>
            {/* Was a link to the campaigns page under /dashboard/operations, removed with
                التشغيل. WhatsApp still cannot be sent from this dialog, so the action is a
                disabled control that says so — an enabled-looking button going nowhere is worse
                than an honestly disabled one. */}
            {channel === "whatsapp" ? (
              <Button disabled className="bg-brand hover:bg-brand/90">
                <Send className="w-4 h-4 me-2" />
                الإرسال غير متاح هنا
              </Button>
            ) : (
              <Button
                onClick={send}
                disabled={sending || !selectedTemplateId || (target.kind === "filtered" && recipientCount === 0)}
                className="bg-brand hover:bg-brand/90"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin me-2" />
                ) : (
                  <Send className="w-4 h-4 me-2" />
                )}
                إرسال
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
