"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Send, AlertTriangle, CheckCircle2, RefreshCw, XCircle, Copy, PlugZap, Save, ShieldCheck, Info } from "lucide-react";
import { toast } from "react-hot-toast";
import { dashDir, dashIntl, dt, dtx } from "@/lib/dashboard/i18n";

interface SetupResponse {
  configured: boolean;
  source?: "dashboard" | "environment";
  missing?: string[];
  botTokenConfigured?: boolean;
  botTokenMasked?: string | null;
  webhookSecretConfigured?: boolean;
  canSaveSecrets?: boolean;
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
  const [busy, setBusy] = useState<"save" | "test" | "register" | "unregister" | null>(null);
  const [form, setForm] = useState({ botToken: "", webhookSecret: "", notificationsChatId: "", allowedChatIds: "", notificationsEnabled: true });
  const [botIdentity, setBotIdentity] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<unknown>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/telegram/setup");
      const data = (await res.json()) as SetupResponse;
      setStatus(data);
      setForm((current) => ({
        ...current,
        notificationsChatId: data.notificationsChatId ?? "",
        allowedChatIds: data.allowedChatIds?.join(", ") ?? "",
        notificationsEnabled: data.notificationsEnabled ?? true,
      }));
    } catch {
      toast.error(dt("تعذّر تحميل حالة البوت"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const saveSettings = async () => {
    setBusy("save");
    try {
      const response = await fetch("/api/telegram/setup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || dt("تعذّر حفظ الإعدادات"));
      setForm((current) => ({ ...current, botToken: "", webhookSecret: "" }));
      toast.success(dt("تم حفظ إعدادات تيليجرام المشفّرة"));
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : dt("تعذّر حفظ الإعدادات"));
    } finally {
      setBusy(null);
    }
  };

  const testConnection = async () => {
    setBusy("test");
    setBotIdentity(null);
    try {
      const response = await fetch("/api/telegram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || dt("فشل اختبار اتصال تيليجرام"));
      const identity = data.bot?.username ? "@" + data.bot.username : data.bot?.name ?? dt("بوت تيليجرام");
      setBotIdentity(identity);
      toast.success(dt("الاتصال يعمل: {0}", [identity]));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : dt("فشل اختبار اتصال تيليجرام"));
    } finally {
      setBusy(null);
    }
  };

  const register = async () => {
    setBusy("register");
    setLastResponse(null);
    try {
      const res = await fetch("/api/telegram/setup", { method: "POST" });
      const data = await res.json();
      setLastResponse(data);
      if (res.ok && data.ok) {
        toast.success(dt("تم تسجيل الـ webhook؛ لم تُرسل أي رسالة."));
        await refresh();
      } else {
        toast.error(data.error || data?.telegram?.description || dt("فشل تسجيل الـ webhook"));
      }
    } catch {
      toast.error(dt("خطأ في الشبكة"));
    } finally {
      setBusy(null);
    }
  };

  const unregister = async () => {
    if (!window.confirm(dt("إلغاء تسجيل الـ webhook؟ سيتوقف البوت عن استقبال الأوامر."))) return;
    setBusy("unregister");
    setLastResponse(null);
    try {
      const res = await fetch("/api/telegram/setup", { method: "DELETE" });
      const data = await res.json();
      setLastResponse(data);
      if (res.ok) {
        toast.success(dt("تم إلغاء تسجيل الـ webhook"));
        await refresh();
      } else {
        toast.error(dt("فشل إلغاء التسجيل"));
      }
    } catch {
      toast.error(dt("خطأ في الشبكة"));
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
    <div className="min-h-0" dir={dashDir()}>
      <div className="space-y-6 p-4 sm:p-6 md:p-8 max-w-3xl mx-auto">
        <header className="flex items-center justify-between gap-4">
          <div className="text-start">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {dt("بوت التيليجرام")}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {dt("إدارة الإشعارات والأوامر  يرسل تنبيهاً لكل تبرع، ويجيب على استفسارات الإحصائيات داخل المجموعة.")}</p>
          </div>
          <Button
            onClick={refresh}
            variant="outline"
            size="sm"
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {dt("تحديث")}</Button>
        </header>

        {loading && !status ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-brand" />{dt("إعداد وربط تيليجرام")}</CardTitle>
                <CardDescription>{dt("أدخل بيانات البوت ومجموعة الإشعارات هنا. الرموز السرية تُخزّن مشفّرة، ولا تظهر بعد الحفظ.")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!status?.canSaveSecrets && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{dt("الحفظ الآمن للرموز من اللوحة يحتاج إعداد INTEGRATION_SETTINGS_ENCRYPTION_KEY على الخادم. يمكنك الاستمرار باستخدام بيانات البيئة الحالية.")}</p>
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="telegram-bot-token">{dt("رمز البوت")}</Label>
                    <Input id="telegram-bot-token" type="password" autoComplete="new-password" dir="ltr" value={form.botToken} disabled={!status?.canSaveSecrets || busy !== null} onChange={(event) => setForm({ ...form, botToken: event.target.value })} placeholder={status?.botTokenMasked ?? dt("أدخل رمز BotFather")} />
                    <p className="text-xs text-slate-500">{status?.botTokenConfigured ? dtx("مخزّن: {0} · اتركه فارغًا للاحتفاظ به", [status.botTokenMasked ?? "••••••••"]) : dt("غير محفوظ")}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="telegram-webhook-secret">{dt("سر التحقق من Webhook")}</Label>
                    <Input id="telegram-webhook-secret" type="password" autoComplete="new-password" dir="ltr" value={form.webhookSecret} disabled={!status?.canSaveSecrets || busy !== null} onChange={(event) => setForm({ ...form, webhookSecret: event.target.value })} placeholder={status?.webhookSecretConfigured ? dt("مخزّن · اتركه فارغًا للاحتفاظ به") : dt("أنشئ سرًا عشوائيًا بطول 16 حرفًا على الأقل")} />
                    <p className="text-xs text-slate-500">{status?.webhookSecretConfigured ? dt("السر محفوظ") : dt("غير محفوظ")}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="telegram-chat-id">{dt("معرّف مجموعة الإشعارات")}</Label>
                    <Input id="telegram-chat-id" dir="ltr" value={form.notificationsChatId} onChange={(event) => setForm({ ...form, notificationsChatId: event.target.value })} placeholder="-1001234567890" />
                    <p className="text-xs text-slate-500">{dt("تصل إليها إشعارات نجاح التبرعات وفشلها.")}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="telegram-allowed-chats">{dt("معرّفات الدردشات المسموح لها بالأوامر")}</Label>
                    <Textarea id="telegram-allowed-chats" dir="ltr" rows={2} value={form.allowedChatIds} onChange={(event) => setForm({ ...form, allowedChatIds: event.target.value })} placeholder="-1001234567890, 123456789" />
                    <p className="text-xs text-slate-500">{dt("افصل الأرقام بفاصلة. مجموعة الإشعارات مسموح لها تلقائيًا.")}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <Label htmlFor="telegram-notifications">{dt("إشعارات التبرعات")}</Label>
                    <p className="text-xs text-slate-500">{dt("إيقافها يوقف إشعارات التبرعات الصادرة فقط؛ تبقى أوامر البوت فعالة.")}</p>
                  </div>
                  <Switch id="telegram-notifications" checked={form.notificationsEnabled} onCheckedChange={(checked) => setForm({ ...form, notificationsEnabled: checked })} />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="outline" onClick={testConnection} disabled={!status?.configured || busy !== null} className="gap-2">
                    {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}{dt("اختبار الاتصال دون إرسال رسالة")}
                  </Button>
                  <Button type="button" onClick={saveSettings} disabled={busy !== null || !form.notificationsChatId.trim()} className="gap-2">
                    {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{dt("حفظ الإعدادات")}
                  </Button>
                </div>
                {botIdentity && <p className="text-end text-xs font-semibold text-emerald-700">{dtx("تم التحقق من البوت: {0}", [botIdentity])}</p>}
              </CardContent>
            </Card>

            {/* Configuration status */}
            <Card className="border-border shadow-sm">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 justify-end">
                  {status?.configured ? (
                    <>
                      <span>{status?.source === "dashboard" ? dt("مهيأ من لوحة التحكم") : dt("مهيأ من متغيرات البيئة")}</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </>
                  ) : (
                    <>
                      <span>{dt("غير مهيأ")}</span>
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {!status?.configured ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 leading-relaxed">
                    <p className="font-semibold mb-1">{dt("بيانات الربط الناقصة:")}</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs font-mono" dir="ltr">
                      {status?.missing?.map((k) => (
                        <li key={k}>{k}</li>
                      ))}
                    </ul>
                    <p className="text-xs mt-2 text-amber-700">{dt("أكمل الحقول الناقصة في نموذج إعداد الربط أعلاه ثم احفظ.")}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <code className="text-slate-700 font-mono" dir="ltr">
                        {status.notificationsChatId}
                      </code>
                      <span className="text-slate-500">{dt("مجموعة الإشعارات")}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          status.notificationsEnabled
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {status.notificationsEnabled ? dt("مفعّلة") : dt("معطّلة")}
                      </span>
                      <span className="text-slate-500">{dt("الإشعارات")}</span>
                    </div>
                    {status.allowedChatIds && status.allowedChatIds.length > 0 && (
                      <div className="flex items-start justify-between gap-2 text-xs">
                        <code className="text-slate-700 font-mono text-right" dir="ltr">
                          {status.allowedChatIds.join(", ")}
                        </code>
                        <span className="text-slate-500 shrink-0">{dt("الدردشات المسموح بها")}</span>
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
                      <span>{dt("الـ webhook مسجَّل")}</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </>
                  ) : (
                    <>
                      <span>{dt("الـ webhook غير مسجَّل")}</span>
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
                            toast.success(dt("تم النسخ"));
                          }}
                          className="text-slate-400 hover:text-brand p-1 rounded shrink-0"
                          title={dt("نسخ")}
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
                      <span className="text-slate-500 shrink-0 text-xs">{dt("عنوان الـ webhook")}</span>
                    </div>
                    {webhook?.pending_update_count != null && webhook.pending_update_count > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-800 text-xs">
                        {dtx("{0} تحديث معلَّق  لم يتمكن تيليجرام من تسليمه. (قد يعني أن الـ webhook غير قابل للوصول).", [webhook.pending_update_count])}</div>
                    )}
                    {lastError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
                        <p className="font-semibold text-xs mb-1 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {dt("آخر خطأ من تيليجرام")}</p>
                        <p className="text-xs font-mono break-all" dir="ltr">
                          {lastError}
                        </p>
                        {lastErrorAt && (
                          <p className="text-[10px] text-red-600 mt-1">
                            {lastErrorAt.toLocaleString(dashIntl("ar-EG"))}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500 text-xs leading-relaxed">
                    {dt("سيقوم تيليجرام بإرسال الرسائل إلى هذا الخادم بعد التسجيل. اضغط الزر أدناه  تأكد أن التطبيق مرفوع على عنوان HTTPS عام (تيليجرام لا يقبل localhost).")}</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-indigo-200 bg-indigo-50/50 shadow-sm">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold"><Info className="h-4 w-4 text-indigo-700" />{dt("ما الذي يصل إلى رسائل البوت؟")}</CardTitle>
                <CardDescription>{dt("هذه هي البيانات المستخدمة حاليًا في الإشعارات والأوامر، وفق كود البوت.")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm leading-6 md:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="font-semibold text-slate-900">{dt("إشعار التبرع")}</h3>
                  <ul className="list-disc space-y-1 ps-5 text-slate-700">
                    <li>{dt("الحالة والمبلغ والعملة، ووقت التبرع.")}</li>
                    <li>{dt("اسم المتبرع ورقم هاتفه كرابط واتساب؛ البريد الإلكتروني لا يظهر في بطاقة الإشعار.")}</li>
                    <li>{dt("الدولة والوجهة وطريقة الدفع أو بوابة الدفع، وهل الاشتراك شهري.")}</li>
                    <li>{dt("مصدر الإحالة ووسوم الحملة الإعلانية إن توفرت، وسبب الفشل عند تعثر التبرع.")}</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-slate-900">{dt("أوامر البوت")}</h3>
                  <ul className="list-disc space-y-1 ps-5 text-slate-700">
                    <li>{dt("/today و/week و/month و/total تعرض أعداد التبرعات والإجماليات وأعلى المشاريع.")}</li>
                    <li>{dt("/recent و/failed و/pending تعرض مبلغًا وحالة واسمًا أو بريدًا عند غياب الاسم والوجهة والتاريخ ومعرّف التبرع.")}</li>
                    <li>{dt("/donor يعرض الاسم والبريد والدولة وإجمالي التبرعات وعددها وآخر تبرع؛ و/donation يعرض تفاصيل التبرع ومرجع البوابة والرسوم عند توفرها.")}</li>
                    <li>{dt("الأوامر ترد فقط في معرّفات الدردشات المسموح بها؛ مجموعة الإشعارات مسموح لها تلقائيًا.")}</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <Card className="border-border shadow-sm">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-semibold text-start">{dt("الإجراءات")}</CardTitle>
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
                  {isRegistered ? dt("إعادة تسجيل الـ webhook") : dt("تسجيل الـ webhook")}
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
                  {dt("إلغاء التسجيل")}</Button>
              </CardContent>
            </Card>

            {/* Raw debug response */}
            {lastResponse != null && (
              <Card className="border-border shadow-sm">
                <CardHeader className="py-4">
                  <CardTitle className="text-sm font-semibold text-start">{dt("آخر استجابة (تشخيص)")}</CardTitle>
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
              {dt("بعد التسجيل، أرسل ")}<code className="bg-slate-100 px-1 rounded font-mono" dir="ltr">/help</code> {dt(" داخل المجموعة لاستعراض الأوامر المتاحة.")}</p>
          </>
        )}
      </div>
    </div>
  );
}
