"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertTriangle,
  Check,
  CreditCard,
  Coins,
  Landmark,
  Loader2,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { SaudiPayforReport } from "./SaudiPayforReport";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { parseMainGateway, type MainGateway } from "@/lib/payment-gateway";
import { dashDir, dt, dtx } from "@/lib/dashboard/i18n";

type SettingsResponse = {
  payforEnabled?: boolean;
  payforSaudiRoutingEnabled?: boolean;
  mainGateway?: string;
  albarakaConfigured?: boolean;
  albarakaRecurringReady?: boolean;
  albarakaUseOOS?: boolean;
  allowAnyAmount?: boolean;
};

const MAIN_GATEWAY_CARDS: {
  value: MainGateway;
  name: string;
  description: string;
  icon: typeof ShieldCheck;
  tone: string;
}[] = [
  {
    value: "STRIPE",
    name: "Stripe",
    get description() { return dt("البوابة العالمية. تقبل كل العملات وتدعم التبرعات الشهرية والبطاقات المحفوظة."); },
    icon: ShieldCheck,
    tone: "bg-indigo-50 text-indigo-700",
  },
  {
    value: "ALBARAKA",
    name: "Albaraka Türk",
    get description() { return dt("بوابة بنك البركة التركي. تدعم الدفع المباشر 2D والتحقق البنكي 3D Secure بحسب إعدادات الدفع وتفويض البنك."); },
    icon: Landmark,
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    value: "PAYFOR",
    name: "Ziraat Katılım",
    get description() { return dt("بوابة زراعات كاتيليم 3D Secure. عند اختيارها تمر كل التبرعات بالبطاقة لمرة واحدة عبرها بكل العملات، ويبقى التبرع الدوري على البركة. مفيدة عند تعطل البركة."); },
    icon: Landmark,
    tone: "bg-amber-50 text-amber-700",
  },
];

export default function PaymentGatewaysPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [savingGateway, setSavingGateway] = useState(false);
  const [savingPayfor, setSavingPayfor] = useState(false);
  const [payforEnabled, setPayforEnabled] = useState(true);
  const [saudiEnabled, setSaudiEnabled] = useState(false);
  const [savingSaudi, setSavingSaudi] = useState(false);
  const [mainGateway, setMainGateway] = useState<MainGateway>("STRIPE");
  const [albarakaConfigured, setAlbarakaConfigured] = useState(true);
  const [albarakaRecurringReady, setAlbarakaRecurringReady] = useState(false);
  const [albarakaUseOOS, setAlbarakaUseOOS] = useState(false);
  const [allowAnyAmount, setAllowAnyAmount] = useState(false);
  const [savingAnyAmount, setSavingAnyAmount] = useState(false);
  // Minimum donation: a USD base and fixed figures for chosen currencies.
  const [minUsd, setMinUsd] = useState("1");
  const [minRows, setMinRows] = useState<{ code: string; amount: string }[]>([]);
  const [savingMin, setSavingMin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError(false);
    axios
      .get<SettingsResponse>("/api/global-settings", {timeout: 20000})
      .then((res) => {
        if (cancelled) return;
        if (!["STRIPE", "ALBARAKA", "PAYFOR"].includes(res.data?.mainGateway || "")) throw new Error("INVALID_PAYMENT_SETTINGS");
        setPayforEnabled(res.data?.payforEnabled !== false);
        setSaudiEnabled(res.data?.payforSaudiRoutingEnabled === true);
        setMainGateway(parseMainGateway(res.data?.mainGateway));
        setAlbarakaConfigured(res.data?.albarakaConfigured === true);
        setAlbarakaRecurringReady(res.data?.albarakaRecurringReady === true);
        setAlbarakaUseOOS(res.data?.albarakaUseOOS === true);
        setAllowAnyAmount(res.data?.allowAnyAmount === true);
        const min = (res.data as { minDonation?: { usd?: number; byCurrency?: Record<string, number> } })?.minDonation;
        setMinUsd(String(min?.usd ?? 1));
        setMinRows(Object.entries(min?.byCurrency ?? {}).map(([code, amount]) => ({ code, amount: String(amount) })));
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const errorMessage = (e: unknown, fallback: string) =>
    axios.isAxiosError(e) && e.response?.data?.error
      ? String(e.response.data.error)
      : fallback;

  /** Explicit confirmation for a change to where donors' money goes. Returns the
   * reason (possibly empty), or null when the admin cancels. */
  const confirmPaymentChange = (what: string): string | null =>
    window.prompt(
      dt("تنبيه: أنت على وشك تغيير مسار الدفع الفعلي لجميع التبرعات الجديدة.\n\n{0}\n\nاكتب سبب التغيير (اختياري) ثم اضغط «موافق» للتأكيد، أو «إلغاء» للتراجع.", [what]),
      ""
    );

  const handleSelectGateway = async (next: MainGateway) => {
    if (loading || loadError || next === mainGateway || savingGateway) return;
    const nextName = MAIN_GATEWAY_CARDS.find((g) => g.value === next)?.name ?? next;
    const currentName = MAIN_GATEWAY_CARDS.find((g) => g.value === mainGateway)?.name ?? mainGateway;
    const reason = confirmPaymentChange(dt("البوابة الرئيسية: {0} ← {1}", [currentName, nextName]));
    if (reason === null) return;
    const prev = mainGateway;
    setMainGateway(next);
    setSavingGateway(true);
    try {
      await axios.put("/api/global-settings", { mainGateway: next, reason });
      toast.success(
        next === "ALBARAKA"
          ? dt("أصبحت Albaraka هي البوابة الرئيسية")
          : dt("أصبحت Stripe هي البوابة الرئيسية")
      );
    } catch (e) {
      setMainGateway(prev);
      toast.error(errorMessage(e, dt("تعذّر حفظ البوابة الرئيسية")));
    } finally {
      setSavingGateway(false);
    }
  };

  const handleTogglePayfor = async (next: boolean) => {
    if (loading || loadError) return;
    const reason = confirmPaymentChange(
      next
        ? dt("تفعيل PayFor: ستمر تبرعات الليرة التركية لمرة واحدة عبر PayFor.")
        : dt("إيقاف PayFor: ستمر تبرعات الليرة التركية عبر البوابة الرئيسية.")
    );
    if (reason === null) return;
    const prev = payforEnabled;
    setPayforEnabled(next);
    setSavingPayfor(true);
    try {
      await axios.put("/api/global-settings", { payforEnabled: next, reason });
      toast.success(
        next
          ? dt("تم تفعيل بوابة PayFor")
          : dt("تم إيقاف PayFor  ستمر تبرعات الليرة التركية عبر البوابة الرئيسية")
      );
    } catch (e) {
      setPayforEnabled(prev);
      toast.error(errorMessage(e, dt("تعذّر حفظ الإعداد")));
    } finally {
      setSavingPayfor(false);
    }
  };

  const handleToggleSaudi = async (next: boolean) => {
    if (loading || loadError || savingSaudi || !payforEnabled) return;
    const reason = confirmPaymentChange(dt("توجيه محاولات البطاقة الجديدة لمرة واحدة من السعودية إلى PayFor 3D."));
    if (reason === null) return;
    setSavingSaudi(true);
    try { const response = await axios.put("/api/global-settings", { payforSaudiRoutingEnabled: next, reason }); setSaudiEnabled(response.data.payforSaudiRoutingEnabled === true); toast.success(dt("تم حفظ الإعداد")); }
    catch (cause) { toast.error(errorMessage(cause, dt("تعذّر حفظ الإعداد"))); }
    finally { setSavingSaudi(false); }
  };

  const handleToggleAnyAmount = async (next: boolean) => {
    if (loading || loadError) return;
    const reason = confirmPaymentChange(
      next
        ? dt("إيقاف الحد الأدنى: يُقبل أي مبلغ في الموقع. قد تفرض البوابة أو البنك حدودًا مستقلة على مبلغ الدفع.")
        : dt("تفعيل الحد الأدنى: لن تقبل السلة وصفحة الدفع تبرعًا لمرة واحدة أقل من المبلغ المحدد في هذا القسم.")
    );
    if (reason === null) return;
    const prev = allowAnyAmount;
    setAllowAnyAmount(next);
    setSavingAnyAmount(true);
    try {
      await axios.put("/api/global-settings", { allowAnyAmount: next, reason });
      toast.success(next ? dt("أصبح بإمكان المتبرعين التبرع بأي مبلغ") : dt("تم تفعيل الحد الأدنى للتبرع"));
    } catch (e) {
      setAllowAnyAmount(prev);
      toast.error(errorMessage(e, dt("تعذّر حفظ الإعداد")));
    } finally {
      setSavingAnyAmount(false);
    }
  };

  const saveMinDonation = async () => {
    const usd = Number(minUsd);
    const rows = minRows.filter((r) => r.code.trim() && r.amount.trim());
    if (!(usd > 0) || rows.some((r) => !/^[A-Z]{3}$/.test(r.code.trim().toUpperCase()) || !(Number(r.amount) > 0))) { toast.error(dt("أدخل مبالغ صحيحة أكبر من صفر ورموز عملات من ثلاثة أحرف")); return; }
    setSavingMin(true);
    try {
      const byCurrency = Object.fromEntries(rows.map((r) => [r.code.trim().toUpperCase(), Number(r.amount)]));
      await axios.put("/api/global-settings", { minDonation: { usd, byCurrency } });
      toast.success(dt("تم حفظ الحد الأدنى للتبرع"));
    } catch (e) { toast.error(errorMessage(e, dt("تعذّر حفظ الإعداد"))); }
    finally { setSavingMin(false); }
  };

  const mainGatewayName =
    MAIN_GATEWAY_CARDS.find((g) => g.value === mainGateway)?.name ?? "Stripe";

  return (
    <div className="space-y-6" dir={dashDir()}>
      <PageHeader
        title={dt("بوابات الدفع")}
        description={dt("اختر البوابة الرئيسية التي تمرّ عبرها التبرعات، وتحكّم في بوابة PayFor للّيرة التركية.")}
        icon={Settings}
      />

      {loading ? (
        <Card className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">{dt("جاري التحميل...")}</span>
        </Card>
      ) : loadError ? (
        <Card role="alert" className="space-y-3 border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><p>{dt("تعذّر تحميل إعدادات الدفع. أعد المحاولة قبل تعديل أي إعداد.")}</p><button type="button" className="rounded-lg border bg-white px-3 py-2" onClick={() => setLoadAttempt(attempt => attempt + 1)}>{dt("إعادة المحاولة")}</button></Card>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                {dt("البوابة الرئيسية")}</h2>
              {savingGateway && (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {dt("البوابة المختارة تتولّى التبرعات بالبطاقة. اختر واحدة فقط: البركة، أو Stripe، أو زراعات (مفيدة عند تعطّل البركة). التبرع الدوري يبقى على البركة، والليرة التركية تمر عبر PayFor عند تفعيله.")}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              {MAIN_GATEWAY_CARDS.map((gateway) => {
                const selected = mainGateway === gateway.value;
                const disabled =
                  savingGateway ||
                  (gateway.value === "ALBARAKA" && !albarakaConfigured) ||
                  (gateway.value === "PAYFOR" && !payforEnabled);
                const Icon = gateway.icon;
                return (
                  <Card
                    key={gateway.value}
                    role="radio"
                    aria-checked={selected}
                    tabIndex={disabled ? -1 : 0}
                    onClick={() => !disabled && handleSelectGateway(gateway.value)}
                    onKeyDown={(e) => {
                      if (disabled) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelectGateway(gateway.value);
                      }
                    }}
                    className={[
                      "p-5 sm:p-6 transition-colors outline-none",
                      disabled
                        ? "opacity-60 cursor-not-allowed"
                        : "cursor-pointer hover:border-gray-300",
                      selected
                        ? "border-emerald-400 ring-1 ring-emerald-200 bg-emerald-50/30"
                        : "",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className={`rounded-full p-2 ${gateway.tone}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-semibold text-gray-900">
                              {gateway.name}
                            </h3>
                            {selected && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-xs font-medium">
                                <Check className="w-3 h-3" />
                                {dt("البوابة الرئيسية")}</span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {gateway.description}
                          </p>
                          {gateway.value === "ALBARAKA" && !albarakaConfigured && (
                            <p className="text-xs text-amber-700 mt-2 flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                              <span>
                                {dt("غير مهيّأة على الخادم  أضف مفتاح التشفير")}<code className="mx-1 font-mono">ALBARAKA_ENC_KEY</code>
                                {dt("من شاشة «Anahtar Yaratma» في البنك.")}</span>
                            </p>
                          )}
                          {gateway.value === "ALBARAKA" &&
                            albarakaConfigured &&
                            albarakaUseOOS && (
                              <p className="text-xs text-muted-foreground mt-2">
                                {dt("يجمع البنك بيانات البطاقة على صفحته الخاصة (Ortak Ödeme Sayfası).")}</p>
                            )}
                        </div>
                      </div>
                      <div
                        className={[
                          "mt-1 h-4 w-4 shrink-0 rounded-full border-2 transition-colors",
                          selected
                            ? "border-emerald-500 bg-emerald-500"
                            : "border-gray-300",
                        ].join(" ")}
                        aria-hidden
                      />
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">{dt("مبلغ التبرع")}</h2>
            {/* One card: the minimum donation, switched on or off, and its figures (owner, 2026-11-27). */}
            <Card className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="rounded-full bg-sky-50 p-2 text-sky-700"><Coins className="w-5 h-5" /></div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{dt("الحد الأدنى للتبرع")}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{allowAnyAmount ? dt("معطّل: يُقبل أي مبلغ.") : dt("مفعّل: لا يُقبل تبرع لمرة واحدة أقل من المبلغ المحدد هنا، ويرى المتبرع تنبيهًا بعملته.")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {savingAnyAmount && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                  <Switch aria-label={dt("تفعيل الحد الأدنى للتبرع")} checked={!allowAnyAmount} disabled={savingAnyAmount} onCheckedChange={(on) => handleToggleAnyAmount(!on)} />
                </div>
              </div>
              {!allowAnyAmount ? (
                <div className="mt-5 space-y-4 border-t pt-5">
                  <label className="flex flex-wrap items-center gap-3 text-sm font-medium text-gray-900">
                    {dt("أقل مبلغ بالدولار")}
                    <span className="flex items-center rounded-lg border bg-white" dir="ltr"><span className="px-2 text-gray-500">$</span><input type="number" min={0.01} step="0.01" className="w-24 rounded-e-lg p-2 outline-none" value={minUsd} onChange={(e) => setMinUsd(e.target.value)} /></span>
                    <span className="text-xs font-normal text-muted-foreground">{dt("ويُحوَّل تلقائيًا لكل عملة بسعر الصرف.")}</span>
                  </label>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-900">{dt("مبلغ ثابت لعملات محددة")} <span className="text-xs font-normal text-muted-foreground">{dt("(اختياري، بدل التحويل بسعر الصرف)")}</span></p>
                    {minRows.map((row, i) => (
                      <div key={i} className="flex items-center gap-2" dir="ltr">
                        <input aria-label={dt("رمز العملة")} placeholder="TRY" maxLength={3} className="w-20 rounded-lg border p-2 uppercase" value={row.code} onChange={(e) => setMinRows((rs) => rs.map((r, j) => j === i ? { ...r, code: e.target.value.toUpperCase() } : r))} />
                        <input aria-label={dt("أقل مبلغ بهذه العملة")} placeholder="300" type="number" min={0.01} step="0.01" className="w-28 rounded-lg border p-2" value={row.amount} onChange={(e) => setMinRows((rs) => rs.map((r, j) => j === i ? { ...r, amount: e.target.value } : r))} />
                        <Button type="button" variant="ghost" onClick={() => setMinRows((rs) => rs.filter((_, j) => j !== i))}>{dt("إزالة")}</Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => setMinRows((rs) => [...rs, { code: "", amount: "" }])}>{dt("+ إضافة عملة")}</Button>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t pt-4">
                    <p className="text-xs text-muted-foreground">{dt("لا يسري على: التبرعات الدورية، والمشاريع بالأسهم، والأوقاف بسعرها الثابت، ودعم الفريق.")}</p>
                    <Button type="button" disabled={savingMin} onClick={() => void saveMinDonation()}>{savingMin ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}{dt("حفظ")}</Button>
                  </div>
                </div>
              ) : null}
            </Card>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">{dt("بوابات إضافية")}</h2>
            <Card className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="rounded-full bg-amber-50 p-2 text-amber-700">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      {dt("PayFor  زراعت كاتيليم (3D Secure للّيرة التركية)")}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {dtx("يُستخدم تلقائيًا للتبرعات الفردية بالليرة التركية (TRY) عبر تدفّق 3D Secure  وهي نفس حالاته السابقة تمامًا. عند الإيقاف تتحوّل هذه التبرعات إلى {0}.", [mainGatewayName])}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {savingPayfor && (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  )}
                  <Switch
                    checked={payforEnabled}
                    disabled={savingPayfor}
                    onCheckedChange={handleTogglePayfor}
                  />
                </div>
              </div>
            </Card>
          </section>

          <section className="space-y-3 rounded-2xl border bg-white p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">{dt("توجيه المتبرعين من السعودية إلى PayFor")}</h2><p className="mt-2 text-sm leading-7 text-slate-600">{dt("للمحاولات الجديدة لمرة واحدة بالبطاقة: يكفي بلد IP سعودي أو رقم هاتف سعودي صحيح. تبقى الاشتراكات وPayPal والتحويل البنكي على مساراتها الحالية. تعطيل PayFor العام يمنع بدء عمليات جديدة عليه.")}</p></div><Switch aria-label={dt("توجيه المتبرعين من السعودية إلى PayFor")} checked={saudiEnabled} disabled={savingSaudi || !payforEnabled} onCheckedChange={handleToggleSaudi} /></div><SaudiPayforReport /></section>

          <Card className="p-5 sm:p-6 space-y-3">
            <h2 className="text-sm font-semibold">{dt("التكرار")}</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <dt>{dt("يومي")} / {dt("كل جمعة")}</dt>
                <dd><span dir="ltr">Albaraka Türk</span> · {albarakaRecurringReady ? dt("إعداد التجديد مكتمل") : dt("غير متاح")}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt>{dt("شهري")}</dt>
                <dd>{mainGatewayName}{mainGateway === "ALBARAKA" ? <> · {albarakaRecurringReady ? dt("إعداد التجديد مكتمل") : dt("غير متاح")}</> : null}</dd>
              </div>
            </dl>
            <p className="text-xs leading-6 text-slate-500">{dt("اكتمال إعداد التجديد لا يثبت نجاح الخصم. راجع آخر تحصيل وأسباب الفشل في التبرعات المتكررة.")} <Link className="text-brand underline" href="/dashboard/monthly">{dt("التبرعات المتكررة")}</Link></p>
          </Card>
        </div>
      )}
    </div>
  );
}
