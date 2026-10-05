"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { Dialog, DialogContent, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageCircle, Clock, ShieldCheck, Megaphone, Loader2, Send, History, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type ReplyWindow = { open: boolean; lastInboundAt: string | null; remainingMs: number; lastInboundMessageId: string | null };
type SmartContext = {
  userId: string;
  phone: string | null;
  name: string | null;
  locale: string;
  country: string | null;
  doNotContact: boolean;
  whatsappOptIn: boolean;
  directSendEnabled: boolean;
  conversationId: string | null;
  replyWindow: ReplyWindow;
  sender: { id: string; name: string; phone: string | null } | null;
  marketingTemplates: Array<{ id: string; name: string; category: string | null }>;
};

function remainingLabel(window: ReplyWindow): string {
  if (!window.open) return "نافذة 24 ساعة مغلقة";
  const hours = Math.floor(window.remainingMs / 3_600_000);
  const minutes = Math.floor((window.remainingMs % 3_600_000) / 60_000);
  return hours ? `نافذة الرد مفتوحة · متبقي ${hours}س ${minutes}د` : `نافذة الرد مفتوحة · متبقي ${minutes}د`;
}

const ERROR_LABELS: Record<string, string> = {
  REPLY_WINDOW_CLOSED: "انتهت نافذة الرد الحر. اختر رسالة خدمة أو قالبًا تسويقيًا.",
  META_DIRECT_SEND_DISABLED: "Direct Send غير مفعّل على بيئة المنصة حاليًا.",
  DO_NOT_CONTACT: "هذا المتبرع موقوف عن التواصل المباشر.",
  NO_RECIPIENT_PHONE: "لا يوجد رقم واتساب صالح لهذا المتبرع.",
  MARKETING_TEMPLATE_REQUIRED: "اختر قالب Marketing معتمد.",
  WHATSAPP_MARKETING_OPT_IN_REQUIRED: "لا توجد موافقة واتساب تسويقية مسجلة لهذا المتبرع.",
  META_TEMPLATE_NOT_APPROVED_FOR_SENDER_LANGUAGE: "لا توجد نسخة معتمدة من القالب لهذا الرقم/اللغة.",
};

export function SmartWhatsappDialog({
  open,
  onOpenChange,
  userId,
  userName,
  phone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName?: string | null;
  phone?: string | null;
}) {
  const [ctx, setCtx] = React.useState<SmartContext | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [mode, setMode] = React.useState<"FREEFORM" | "UTILITY" | "MARKETING">("UTILITY");
  const [body, setBody] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/communication/whatsapp/smart-send?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "load failed");
      const next = data.context as SmartContext;
      setCtx(next);
      setMode(next.replyWindow.open ? "FREEFORM" : "UTILITY");
    } catch {
      toast.error("تعذّر تجهيز إرسال واتساب لهذا المتبرع.");
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    if (!open) return;
    setBody("");
    setTemplateId("");
    void load();
  }, [open, load]);

  const send = async () => {
    if (!ctx) return;
    if ((mode === "FREEFORM" || mode === "UTILITY") && !body.trim()) {
      toast.error("اكتب الرسالة أولًا.");
      return;
    }
    if (mode === "MARKETING" && !templateId) {
      toast.error("اختر قالب Marketing معتمد.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/dashboard/communication/whatsapp/smart-send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId,
          mode,
          body: mode === "MARKETING" ? null : body.trim(),
          templateId: mode === "MARKETING" ? templateId : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(ERROR_LABELS[data.error] ?? [data.error, data.detail].filter(Boolean).join(" — ") ?? "تعذّر الإرسال.");
        return;
      }
      const transport = data.result?.transport;
      toast.success(
        transport === "FREEFORM"
          ? "تم إرسال الرد داخل نافذة 24 ساعة."
          : transport === "DIRECT_SEND"
            ? "تم إرسال رسالة الخدمة عبر Direct Send."
            : "تم إرسال القالب التسويقي المعتمد.",
      );
      setBody("");
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  };

  const tabs = [
    {
      id: "FREEFORM" as const,
      title: "رد مباشر",
      desc: "نص حر داخل نافذة 24 ساعة",
      icon: MessageCircle,
      disabled: !ctx?.replyWindow.open,
    },
    {
      id: "UTILITY" as const,
      title: "رسالة خدمة",
      desc: "Direct Send · Utility",
      icon: ShieldCheck,
      disabled: !ctx?.directSendEnabled,
    },
    {
      id: "MARKETING" as const,
      title: "رسالة تسويقية",
      desc: "قالب Marketing معتمد",
      icon: Megaphone,
      disabled: Boolean(ctx && !ctx.whatsappOptIn),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogOverlay className="fixed inset-0 bg-black/50" />
      <DialogContent
        className="fixed left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto p-0 transform -translate-x-1/2 -translate-y-1/2 border border-border rounded-2xl shadow-2xl bg-white"
        dir="rtl"
      >
        <div className="border-b border-slate-100 bg-slate-900 px-5 py-4 text-white">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <MessageCircle className="h-5 w-5 text-[#25D366]" />
            التواصل عبر واتساب
          </DialogTitle>
          <div className="mt-1 text-xs text-white/70">
            {ctx?.name || userName || "المتبرع"} · <span dir="ltr">{ctx?.phone || phone || "—"}</span>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {loading ? (
            <div className="flex min-h-52 items-center justify-center text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : ctx ? (
            <>
              <div className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-xs",
                ctx.replyWindow.open
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800",
              )}>
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  {ctx.replyWindow.open ? <Clock className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
                  {remainingLabel(ctx.replyWindow)}
                </span>
                <span>
                  {ctx.sender?.phone ? `الرقم التجاري: ${ctx.sender.phone}` : "سيُختار رقم الإرسال تلقائيًا"}
                </span>
              </div>

              {ctx.doNotContact && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  المتبرع موقوف عن الرسائل الجديدة. يمكن فقط الرد على رسالة واردة أثناء نافذة 24 ساعة.
                </div>
              )}
              {!ctx.whatsappOptIn && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  لا توجد موافقة تسويقية عبر واتساب لهذا المتبرع؛ لذلك القوالب التسويقية معطلة. رسائل الخدمة لا تتأثر ما لم يكن التواصل موقوفًا بالكامل.
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = mode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      disabled={tab.disabled}
                      onClick={() => setMode(tab.id)}
                      className={cn(
                        "rounded-xl border p-3 text-right transition",
                        active ? "border-brand bg-brand/5 ring-1 ring-brand/20" : "border-slate-200 hover:bg-slate-50",
                        tab.disabled && "cursor-not-allowed opacity-45",
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Icon className="h-4 w-4" />
                        {tab.title}
                      </span>
                      <span className="mt-1 block text-[11px] text-slate-500">{tab.desc}</span>
                    </button>
                  );
                })}
              </div>

              {mode === "MARKETING" ? (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700">القالب التسويقي المعتمد</label>
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="">اختر القالب</option>
                    {ctx.marketingTemplates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </select>
                  <p className="text-[11px] leading-5 text-slate-500">
                    خارج نافذة 24 ساعة لا تُرسل الرسائل التسويقية كنص حر. المنصة تستخدم نسخة Meta المعتمدة المناسبة للغة والرقم التجاري.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700">
                    {mode === "UTILITY" ? "رسالة خدمة مرتبطة بعلاقة المتبرع بالمؤسسة" : "الرسالة"}
                  </label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={6}
                    maxLength={4096}
                    placeholder={
                      mode === "UTILITY"
                        ? "مثال: تم إصدار إيصال تبرعك ويمكننا إرسال الرابط لك هنا."
                        : "اكتب ردك للمتبرع…"
                    }
                    className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-brand"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>
                      {mode === "UTILITY"
                        ? "يُرسل كـ Utility عبر Direct Send، وليس كرسالة تسويقية."
                        : "يرسل كنص حر لأن نافذة خدمة العميل مفتوحة."}
                    </span>
                    <span>{body.length}/4096</span>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/dashboard/communication/inbox?q=${encodeURIComponent(ctx.phone ?? "")}`}>
                    <History className="me-1.5 h-4 w-4" />
                    سجل المحادثة
                  </Link>
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>إلغاء</Button>
                  <Button
                    onClick={send}
                    disabled={sending || (mode === "MARKETING" ? !templateId : !body.trim()) || (mode === "UTILITY" && !ctx.directSendEnabled)}
                    className="bg-[#25D366] text-white hover:bg-[#20bd5a]"
                  >
                    {sending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Send className="me-2 h-4 w-4" />}
                    إرسال
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="py-10 text-center text-sm text-slate-500">تعذّر تحميل حالة واتساب للمتبرع.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
