"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  AlertTriangle,
  Check,
  CreditCard,
  Landmark,
  Loader2,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { parseMainGateway, type MainGateway } from "@/lib/payment-gateway";

type SettingsResponse = {
  payforEnabled?: boolean;
  mainGateway?: string;
  albarakaConfigured?: boolean;
  albarakaUseOOS?: boolean;
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
    description:
      "البوابة العالمية. تقبل كل العملات وتدعم التبرعات الشهرية والبطاقات المحفوظة.",
    icon: ShieldCheck,
    tone: "bg-indigo-50 text-indigo-700",
  },
  {
    value: "ALBARAKA",
    name: "Albaraka Türk (3D Secure)",
    description:
      "بوابة بنك البركة التركي عبر تدفّق 3D Secure. تُحوَّل التبرعات إلى الليرة التركية وتُحصَّل من البنك مباشرة.",
    icon: Landmark,
    tone: "bg-emerald-50 text-emerald-700",
  },
];

export default function PaymentGatewaysPage() {
  const [loading, setLoading] = useState(true);
  const [savingGateway, setSavingGateway] = useState(false);
  const [savingPayfor, setSavingPayfor] = useState(false);
  const [payforEnabled, setPayforEnabled] = useState(true);
  const [mainGateway, setMainGateway] = useState<MainGateway>("STRIPE");
  const [albarakaConfigured, setAlbarakaConfigured] = useState(true);
  const [albarakaUseOOS, setAlbarakaUseOOS] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axios
      .get<SettingsResponse>("/api/global-settings")
      .then((res) => {
        if (cancelled) return;
        setPayforEnabled(res.data?.payforEnabled !== false);
        setMainGateway(parseMainGateway(res.data?.mainGateway));
        setAlbarakaConfigured(res.data?.albarakaConfigured !== false);
        setAlbarakaUseOOS(res.data?.albarakaUseOOS === true);
      })
      .catch(() => {
        if (cancelled) return;
        setPayforEnabled(true);
        setMainGateway("STRIPE");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const errorMessage = (e: unknown, fallback: string) =>
    axios.isAxiosError(e) && e.response?.data?.error
      ? String(e.response.data.error)
      : fallback;

  const handleSelectGateway = async (next: MainGateway) => {
    if (next === mainGateway || savingGateway) return;
    const prev = mainGateway;
    setMainGateway(next);
    setSavingGateway(true);
    try {
      await axios.put("/api/global-settings", { mainGateway: next });
      toast.success(
        next === "ALBARAKA"
          ? "أصبحت Albaraka هي البوابة الرئيسية"
          : "أصبحت Stripe هي البوابة الرئيسية"
      );
    } catch (e) {
      setMainGateway(prev);
      toast.error(errorMessage(e, "تعذّر حفظ البوابة الرئيسية"));
    } finally {
      setSavingGateway(false);
    }
  };

  const handleTogglePayfor = async (next: boolean) => {
    const prev = payforEnabled;
    setPayforEnabled(next);
    setSavingPayfor(true);
    try {
      await axios.put("/api/global-settings", { payforEnabled: next });
      toast.success(
        next
          ? "تم تفعيل بوابة PayFor"
          : "تم إيقاف PayFor — ستمر تبرعات الليرة التركية عبر البوابة الرئيسية"
      );
    } catch (e) {
      setPayforEnabled(prev);
      toast.error(errorMessage(e, "تعذّر حفظ الإعداد"));
    } finally {
      setSavingPayfor(false);
    }
  };

  const mainGatewayName =
    MAIN_GATEWAY_CARDS.find((g) => g.value === mainGateway)?.name ?? "Stripe";

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="بوابات الدفع"
        description="اختر البوابة الرئيسية التي تمرّ عبرها التبرعات، وتحكّم في بوابة PayFor للّيرة التركية."
        icon={Settings}
      />

      {loading ? (
        <Card className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">جاري التحميل...</span>
        </Card>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                البوابة الرئيسية
              </h2>
              {savingGateway && (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              البوابة المختارة تتولّى كل حالات الدفع التي لا تمر عبر PayFor. يمكن
              اختيار واحدة فقط، وتعمل البوابتان في نفس الحالات تمامًا.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {MAIN_GATEWAY_CARDS.map((gateway) => {
                const selected = mainGateway === gateway.value;
                const disabled =
                  savingGateway ||
                  (gateway.value === "ALBARAKA" && !albarakaConfigured);
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
                      <div className="flex items-start gap-3">
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
                                البوابة الرئيسية
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {gateway.description}
                          </p>
                          {gateway.value === "ALBARAKA" && !albarakaConfigured && (
                            <p className="text-xs text-amber-700 mt-2 flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                              <span>
                                غير مهيّأة على الخادم — أضف مفتاح التشفير
                                <code className="mx-1 font-mono">ALBARAKA_ENC_KEY</code>
                                من شاشة «Anahtar Yaratma» في البنك.
                              </span>
                            </p>
                          )}
                          {gateway.value === "ALBARAKA" &&
                            albarakaConfigured &&
                            albarakaUseOOS && (
                              <p className="text-xs text-muted-foreground mt-2">
                                يجمع البنك بيانات البطاقة على صفحته الخاصة (Ortak
                                Ödeme Sayfası).
                              </p>
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
            <h2 className="text-sm font-semibold text-gray-900">بوابات إضافية</h2>
            <Card className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-amber-50 p-2 text-amber-700">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      PayFor — زراعت كاتيليم (3D Secure للّيرة التركية)
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      يُستخدم تلقائيًا للتبرعات الفردية بالليرة التركية (TRY) عبر
                      تدفّق 3D Secure — وهي نفس حالاته السابقة تمامًا. عند
                      الإيقاف تتحوّل هذه التبرعات إلى {mainGatewayName}.
                    </p>
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

          <p className="text-xs text-muted-foreground leading-relaxed">
            التبرعات الشهرية تمرّ دائمًا عبر Stripe لأنها تحتاج إلى تحصيل متكرر لا
            توفّره بوابتا 3D Secure. كما يبقى Stripe هو المسار الاحتياطي عند فشل أي
            عملية 3D Secure.
          </p>
        </div>
      )}
    </div>
  );
}
