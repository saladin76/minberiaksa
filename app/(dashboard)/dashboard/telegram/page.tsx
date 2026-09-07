"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Send, AlertTriangle, CheckCircle2, RefreshCw, XCircle, Copy } from "lucide-react";
import { toast } from "react-hot-toast";

interface SetupResponse {
  configured: boolean;
  missing?: string[];
  notificationsChatId?: string;
  notificationsEnabled?: boolean;
  allowedChatIds?: string[];
  webhookInfo?: {
    ok: boolean;
    result?: {
      url?: string;
      pending_update_count?: number;
      last_error_date?: number;
      last_error_message?: string;
      ip_address?: string;
    };
    description?: string;
  };
}

export default function TelegramAdminPage() {
  const [status, setStatus] = useState<SetupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"register" | "unregister" | null>(null);
  const [lastResponse, setLastResponse] = useState<unknown>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/telegram/setup");
      const data = (await res.json()) as SetupResponse;
      setStatus(data);
    } catch (e) {
      toast.error("تعذّر تحميل حالة البوت");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const register = async () => {
    setBusy("register");
    setLastResponse(null);
    try {
      const res = await fetch("/api/telegram/setup", { method: "POST" });
      const data = await res.json();
      setLastResponse(data);
      if (res.ok && data.ok) {
        toast.success("تم تسجيل الـ webhook — تحقق من مجموعة التيليجرام");
        await refresh();
      } else {
        toast.error(data.error || data?.telegram?.description || "فشل تسجيل الـ webhook");
      }
    } catch (e) {
      toast.error("خطأ في الشبكة");
    } finally {
      setBusy(null);
    }
  };

  const unregister = async () => {
    if (!window.confirm("إلغاء تسجيل الـ webhook؟ سيتوقف البوت عن استقبال الأوامر.")) return;
    setBusy("unregister");
    setLastResponse(null);
    try {
      const res = await fetch("/api/telegram/setup", { method: "DELETE" });
      const data = await res.json();
      setLastResponse(data);
      if (res.ok) {
        toast.success("تم إلغاء تسجيل الـ webhook");
        await refresh();
      } else {
        toast.error("فشل إلغاء التسجيل");
      }
    } catch {
      toast.error("خطأ في الشبكة");
    } finally {
      setBusy(null);
    }
  };

  const webhook = status?.webhookInfo?.result;
  const webhookUrl = webhook?.url ?? "";
  const isRegistered = Boolean(webhookUrl);
  const lastError = webhook?.last_error_message;
  const lastErrorAt = webhook?.last_error_date ? new Date(webhook.last_error_date * 1000) : null;

  return (
    <div className="min-h-0" dir="rtl">
      <div className="space-y-6 p-4 sm:p-6 md:p-8 max-w-3xl mx-auto">
        <header className="flex items-center justify-between gap-4">
          <div className="text-right">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              بوت التيليجرام
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              إدارة الإشعارات والأوامر — يرسل تنبيهاً لكل تبرع، ويجيب على استفسارات الإحصائيات داخل المجموعة.
            </p>
          </div>
          <Button
            onClick={refresh}
            variant="outline"
            size="sm"
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </header>

        {loading && !status ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {/* Configuration status */}
            <Card className="border-border shadow-sm">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 justify-end">
                  {status?.configured ? (
                    <>
                      <span>مهيأ بمتغيرات البيئة</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </>
                  ) : (
                    <>
                      <span>غير مهيأ</span>
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {!status?.configured ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 leading-relaxed">
                    <p className="font-semibold mb-1">المتغيرات المفقودة:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs font-mono" dir="ltr">
                      {status?.missing?.map((k) => (
                        <li key={k}>{k}</li>
                      ))}
                    </ul>
                    <p className="text-xs mt-2 text-amber-700">
                      أضفها إلى ملف <code>.env</code> ثم أعد تشغيل الخادم.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <code className="text-slate-700 font-mono" dir="ltr">
                        {status.notificationsChatId}
                      </code>
                      <span className="text-slate-500">مجموعة الإشعارات</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          status.notificationsEnabled
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {status.notificationsEnabled ? "مفعّلة" : "معطّلة"}
                      </span>
                      <span className="text-slate-500">الإشعارات</span>
                    </div>
                    {status.allowedChatIds && status.allowedChatIds.length > 0 && (
                      <div className="flex items-start justify-between gap-2 text-xs">
                        <code className="text-slate-700 font-mono text-right" dir="ltr">
                          {status.allowedChatIds.join(", ")}
                        </code>
                        <span className="text-slate-500 shrink-0">الدردشات المسموح بها</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Webhook status */}
            <Card className="border-border shadow-sm">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 justify-end">
                  {isRegistered ? (
                    <>
                      <span>الـ webhook مسجَّل</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </>
                  ) : (
                    <>
                      <span>الـ webhook غير مسجَّل</span>
                      <XCircle className="w-4 h-4 text-slate-400" />
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {isRegistered ? (
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(webhookUrl);
                            toast.success("تم النسخ");
                          }}
                          className="text-slate-400 hover:text-brand p-1 rounded shrink-0"
                          title="نسخ"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <code
                          className="text-xs text-slate-700 font-mono truncate min-w-0 inline-block max-w-full"
                          dir="ltr"
                          title={webhookUrl}
                        >
                          {webhookUrl}
                        </code>
                      </div>
                      <span className="text-slate-500 shrink-0 text-xs">عنوان الـ webhook</span>
                    </div>
                    {webhook?.pending_update_count != null && webhook.pending_update_count > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-800 text-xs">
                        {webhook.pending_update_count} تحديث معلَّق — لم يتمكن تيليجرام من تسليمه. (قد يعني أن الـ webhook غير قابل للوصول).
                      </div>
                    )}
                    {lastError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
                        <p className="font-semibold text-xs mb-1 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          آخر خطأ من تيليجرام
                        </p>
                        <p className="text-xs font-mono break-all" dir="ltr">
                          {lastError}
                        </p>
                        {lastErrorAt && (
                          <p className="text-[10px] text-red-600 mt-1">
                            {lastErrorAt.toLocaleString("ar-EG")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500 text-xs leading-relaxed">
                    سيقوم تيليجرام بإرسال الرسائل إلى هذا الخادم بعد التسجيل. اضغط الزر أدناه — تأكد أن التطبيق مرفوع على عنوان HTTPS عام (تيليجرام لا يقبل localhost).
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <Card className="border-border shadow-sm">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-semibold text-right">الإجراءات</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                <Button
                  onClick={register}
                  disabled={!status?.configured || busy != null}
                  className="bg-brand hover:bg-brand-dark gap-2 order-1 sm:order-2"
                >
                  {busy === "register" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {isRegistered ? "إعادة تسجيل الـ webhook" : "تسجيل الـ webhook"}
                </Button>
                <Button
                  onClick={unregister}
                  disabled={!isRegistered || busy != null}
                  variant="outline"
                  className="gap-2 order-2 sm:order-1"
                >
                  {busy === "unregister" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  إلغاء التسجيل
                </Button>
              </CardContent>
            </Card>

            {/* Raw debug response */}
            {lastResponse != null && (
              <Card className="border-border shadow-sm">
                <CardHeader className="py-4">
                  <CardTitle className="text-sm font-semibold text-right">آخر استجابة (تشخيص)</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre
                    className="text-[11px] font-mono bg-slate-50 rounded-lg p-3 overflow-x-auto leading-relaxed text-slate-700"
                    dir="ltr"
                  >
                    {JSON.stringify(lastResponse, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}

            <p className="text-[11px] text-slate-500 text-center leading-relaxed">
              بعد التسجيل، أرسل <code className="bg-slate-100 px-1 rounded font-mono" dir="ltr">/help</code> داخل المجموعة لاستعراض الأوامر المتاحة.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
