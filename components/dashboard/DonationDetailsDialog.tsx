"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Megaphone,
  Globe,
  Target,
  MonitorSmartphone,
  Users,
  Map,
  Languages,
  Filter,
  Compass,
  Link2,
  CornerDownLeft,
  Laptop,
  Network,
  CreditCard,
  Hash,
  AlertTriangle,
  Copy,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import {
  detectDonationSource,
  PLATFORM_LABEL_AR,
  STATUS_LABEL_AR,
  type DonationSourceStatus,
} from "@/lib/attribution/detect-source";
import { dashDir, dashIntl, dt, dtx } from "@/lib/dashboard/i18n";
import { GATEWAY_LOGOS, GATEWAY_NAMES } from "./DonationGatewayBadge";

type Mode = "attribution" | "payment" | "error";

export interface DonationDetailsTarget {
  id: string;
  provider?: string | null;
  providerOrderId?: string | null;
  providerErrorMessage?: string | null;
  paymentMethod?: string | null;
  attribution?: Record<string, unknown> | null;
  conversionEventsSentAt?: string | null;
  conversionFailedEventsSentAt?: string | null;
  status?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  donation: DonationDetailsTarget | null;
}

/** Keys hidden in the attribution view (IDs, raw click identifiers, fingerprint cookies). */
const HIDDEN_ATTRIBUTION_KEYS = new Set([
  "utm_id",
  "campaign_id",
  "adset_id",
  "ad_id",
  "fbclid",
  "gclid",
  "fbp",
  "fbc",
  "ga_client_id",
  "ga_session_id",
  "ttclid",
  "_ga",
]);

interface FieldDef {
  key: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  span?: 1 | 2;
  ltr?: boolean;
}

/** Order + presentation for known attribution fields. Anything in `attribution`
 *  that isn't here (and isn't an ID) still falls through to a generic row. */
const ATTRIBUTION_FIELDS: FieldDef[] = [
  { key: "utm_campaign", get label() { return dt("الحملة الإعلانية"); }, Icon: Megaphone, get hint() { return dt("اسم الحملة في إدارة الإعلانات"); } },
  { key: "utm_source", get label() { return dt("المصدر"); }, Icon: Globe, hint: "Facebook / Google / TikTok …" },
  { key: "utm_medium", get label() { return dt("الوسيلة"); }, Icon: Target, hint: "cpc / social / email …" },
  { key: "utm_content", get label() { return dt("محتوى الإعلان"); }, Icon: Filter },
  { key: "utm_term", get label() { return dt("الكلمة المفتاحية"); }, Icon: Filter },
  { key: "objective", get label() { return dt("الهدف"); }, Icon: Compass },
  { key: "funnel", get label() { return dt("مرحلة القمع"); }, Icon: Filter },
  { key: "placement", get label() { return dt("موضع الإعلان"); }, Icon: MonitorSmartphone },
  { key: "audience_type", get label() { return dt("نوع الجمهور"); }, Icon: Users },
  { key: "target_country", get label() { return dt("دولة الاستهداف"); }, Icon: Map },
  { key: "target_region", get label() { return dt("منطقة الاستهداف"); }, Icon: Map },
  { key: "language", get label() { return dt("اللغة"); }, Icon: Languages },
  { key: "device", get label() { return dt("الجهاز"); }, Icon: Laptop },
  { key: "platform", get label() { return dt("المنصة"); }, Icon: MonitorSmartphone },
  { key: "landing_page", get label() { return dt("صفحة الهبوط"); }, Icon: Link2, span: 2, ltr: true },
  { key: "referrer", get label() { return dt("المُحيل"); }, Icon: CornerDownLeft, span: 2, ltr: true },
  { key: "user_agent", get label() { return dt("متصفح الزائر"); }, Icon: Laptop, span: 2, ltr: true },
  { key: "client_ip", get label() { return dt("عنوان IP"); }, Icon: Network, ltr: true },
];

function copy(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  navigator.clipboard.writeText(value).then(
    () => toast.success(dt("تم النسخ")),
    () => toast.error(dt("تعذّر النسخ"))
  );
}

function isHttpUrl(v: string) {
  return /^https?:\/\//i.test(v);
}

function FieldCard({
  def,
  value,
}: {
  def: { label: string; Icon: React.ComponentType<{ className?: string }>; hint?: string; span?: 1 | 2; ltr?: boolean };
  value: string;
}) {
  const showLink = def.ltr && isHttpUrl(value);
  return (
    <div
      className={cn(
        "group rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-brand/40 hover:bg-brand/[0.02]",
        def.span === 2 ? "sm:col-span-2" : ""
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
          <def.Icon className="w-3.5 h-3.5 text-brand" />
          <span>{def.label}</span>
        </div>
        <button
          type="button"
          onClick={() => copy(value)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-brand p-0.5 rounded"
          title={dt("نسخ")}
          aria-label={dt("نسخ {0}", [def.label])}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
      <div
        className={cn(
          "text-sm font-medium text-slate-800 break-words",
          def.ltr ? "font-mono text-xs" : ""
        )}
        dir={def.ltr ? "ltr" : undefined}
      >
        {showLink ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline inline-flex items-center gap-1"
          >
            <span className="truncate inline-block max-w-full align-bottom">{value}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        ) : (
          value
        )}
      </div>
      {def.hint && (
        <p className="text-[10px] text-slate-400 mt-1 leading-tight">{def.hint}</p>
      )}
    </div>
  );
}

function prettifyKey(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_BANNER_CLASS: Record<DonationSourceStatus, string> = {
  verified: "bg-emerald-50 border-emerald-200 text-emerald-900",
  "utm-only": "bg-amber-50 border-amber-200 text-amber-900",
  "tracking-error": "bg-rose-50 border-rose-200 text-rose-900",
  organic: "bg-slate-50 border-slate-200 text-slate-700",
};

const STATUS_DOT_BANNER: Record<DonationSourceStatus, string> = {
  verified: "bg-emerald-500",
  "utm-only": "bg-amber-400",
  "tracking-error": "bg-rose-500",
  organic: "bg-slate-300",
};

function SourceSummary({ donation }: { donation: DonationDetailsTarget }) {
  const result = detectDonationSource({
    attribution: donation.attribution,
    conversionEventsSentAt: donation.conversionEventsSentAt,
    conversionFailedEventsSentAt: donation.conversionFailedEventsSentAt,
    status: donation.status,
  });
  return (
    <div className={cn("rounded-xl border px-3.5 py-3 mb-3", STATUS_BANNER_CLASS[result.status])}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className={cn("inline-block w-2 h-2 rounded-full", STATUS_DOT_BANNER[result.status])} aria-hidden />
          <span className="text-sm font-semibold">{PLATFORM_LABEL_AR[result.platform]}</span>
          <span className="text-[11px] opacity-70">— {STATUS_LABEL_AR[result.status]}</span>
        </div>
        <div className="text-[11px] font-medium opacity-80">{dtx("الثقة {0}%", [result.confidence])}</div>
      </div>
      {result.reasons.length > 0 && (
        <ul className="text-[11px] leading-relaxed space-y-0.5 opacity-90">
          {result.reasons.map((r, i) => (
            <li key={i}>• {r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AttributionView({ donation }: { donation: DonationDetailsTarget }) {
  const attr = (donation.attribution ?? {}) as Record<string, unknown>;

  const visibleEntries = useMemo(() => {
    const entries: Array<{ def: FieldDef; value: string }> = [];
    const seen = new Set<string>();

    // Known fields first, in defined order
    for (const def of ATTRIBUTION_FIELDS) {
      const raw = attr[def.key];
      if (raw == null || raw === "") continue;
      const value = String(raw);
      entries.push({ def, value });
      seen.add(def.key);
    }

    // Anything unknown (and not an ID)  surface with a generic icon so admins
    // can still see new attribution fields without redeploying this dialog.
    for (const [k, v] of Object.entries(attr)) {
      if (seen.has(k) || HIDDEN_ATTRIBUTION_KEYS.has(k)) continue;
      if (v == null || v === "") continue;
      entries.push({
        def: { key: k, label: prettifyKey(k), Icon: Filter, span: String(v).length > 60 ? 2 : 1, ltr: /[A-Za-z0-9_/.:?=&-]/.test(String(v)) && !/[؀-ۿ]/.test(String(v)) },
        value: String(v),
      });
    }

    return entries;
  }, [attr]);

  if (visibleEntries.length === 0) {
    return (
      <div>
        <SourceSummary donation={donation} />
        <div className="py-10 text-center">
          <Megaphone className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">
            {dt("لا توجد بيانات إسناد إعلاني لهذا التبرع")}</p>
          <p className="text-[11px] text-slate-400 mt-1">
            {dt("ربما وصل المتبرع مباشرةً دون إعلان متتبَّع")}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SourceSummary donation={donation} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {visibleEntries.map(({ def, value }) => (
          <FieldCard key={def.key} def={def} value={value} />
        ))}
      </div>
    </div>
  );
}

type GatewayDetails = {
  id: string;
  provider: string | null;
  paymentMethod: string | null;
  status: string;
  amount: number;
  currency: string;
  totalAmount: number;
  amountUSD: number | null;
  paidAmount: number | null;
  paidCurrency: string | null;
  createdAt: string;
  paidAt: string | null;
  billingReason: string | null;
  refs: {
    providerOrderId: string | null;
    providerAuthCode: string | null;
    providerHostRefNum: string | null;
    paypalOrderId: string | null;
    paypalCaptureId: string | null;
    stripeSubscriptionId: string | null;
    subscriptionId: string | null;
    maskedPan: string | null;
  };
  txn: { type: string | null; result: string | null; returnCode: string | null; errorMessage: string | null };
  raw: Array<{ path: string; value: string }>;
  rawTruncated: boolean;
};

type RefRow = { label: string; value: string; hint?: string; href?: string };

/** The references that find this donation in the gateway's own panel, named the way that gateway names them. */
function gatewayReferences(d: GatewayDetails): RefRow[] {
  const r = d.refs;
  const rows: RefRow[] = [];
  const add = (label: string, value: string | null, hint?: string, href?: string) => {
    if (value) rows.push({ label, value, hint, href });
  };
  const stripeSearch = (id: string) => `https://dashboard.stripe.com/search?query=${encodeURIComponent(id)}`;

  switch (d.provider) {
    case "ALBARAKA":
      add(dt("رقم الطلب (OrderId)"), r.providerOrderId, dt("الرقم الذي أرسلناه للبنك مع العملية"));
      add(dt("رقم المرجع لدى البنك (ReferenceCode)"), r.providerHostRefNum, dt("مرجع البنك للعملية، يُطلب عند الإلغاء أو الاسترداد"));
      add(dt("رمز الموافقة (AuthCode)"), r.providerAuthCode, dt("رمز موافقة البنك على الخصم"));
      break;
    case "PAYFOR":
      add(dt("رقم الطلب (OrderId)"), r.providerOrderId, dt("الرقم الذي أرسلناه للبنك مع العملية"));
      add(dt("رقم المرجع لدى البنك (HostRefNum)"), r.providerHostRefNum, dt("مرجع البنك للعملية، يُطلب عند الإلغاء أو الاسترداد"));
      add(dt("رمز الموافقة (AuthCode)"), r.providerAuthCode, dt("رمز موافقة البنك على الخصم"));
      break;
    case "PAYPAL":
      add(dt("معرف طلب PayPal (Order ID)"), r.paypalOrderId ?? r.providerOrderId);
      add(
        dt("معرف المعاملة في PayPal (Capture ID)"),
        r.paypalCaptureId ?? r.providerHostRefNum,
        dt("رقم المعاملة كما يظهر في حساب PayPal، ويُستخدم للبحث والاسترداد"),
        r.paypalCaptureId ? `https://www.paypal.com/activity/payment/${encodeURIComponent(r.paypalCaptureId)}` : undefined,
      );
      break;
    case "STRIPE":
      add(dt("معرف العملية في Stripe"), r.providerOrderId, dt("جلسة الدفع أو الفاتورة أو عملية الدفع"), r.providerOrderId ? stripeSearch(r.providerOrderId) : undefined);
      add(dt("معرف الدفع أو الاشتراك في Stripe"), r.providerAuthCode, undefined, r.providerAuthCode ? stripeSearch(r.providerAuthCode) : undefined);
      add(dt("معرف الاشتراك في Stripe"), r.stripeSubscriptionId !== r.providerAuthCode ? r.stripeSubscriptionId : null, undefined, r.stripeSubscriptionId ? stripeSearch(r.stripeSubscriptionId) : undefined);
      break;
    default:
      add(dt("معرف الطلب لدى البوابة"), r.providerOrderId);
      add(dt("رقم المرجع لدى البنك"), r.providerHostRefNum);
      add(dt("رمز الموافقة (AuthCode)"), r.providerAuthCode);
  }
  add(dt("البطاقة (مقنّعة)"), r.maskedPan, dt("آخر أرقام البطاقة كما أرجعها البنك"));
  add(dt("رقم التبرع لدينا"), d.id, dt("يُرسل غالبًا للبوابة كرقم الطلب"));
  return rows;
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString(dashIntl("ar-EG"), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    numberingSystem: "latn",
    timeZone: "Europe/Istanbul",
  });
}

function money(amount: number | null, currency: string | null) {
  if (amount == null) return null;
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency ?? ""}`.trim();
}

function RefCard({ row }: { row: RefRow }) {
  return (
    <div className="group rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-brand/40">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          <Hash className="w-3.5 h-3.5 text-brand" />
          <span>{row.label}</span>
        </div>
        <div className="flex items-center gap-1">
          {row.href && (
            <a href={row.href} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-brand p-0.5 rounded" title={dt("فتح في لوحة البوابة")}>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button type="button" onClick={() => copy(row.value)} className="text-slate-400 hover:text-brand p-0.5 rounded" title={dt("نسخ")} aria-label={dt("نسخ {0}", [row.label])}>
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="font-mono text-xs font-medium text-slate-800 break-all" dir="ltr">{row.value}</div>
      {row.hint && <p className="text-[10px] text-slate-400 mt-1 leading-tight">{row.hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function PaymentView({ donation }: { donation: DonationDetailsTarget }) {
  const [details, setDetails] = useState<GatewayDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetails(null);
    setError(null);
    fetch(`/api/admin/donations/${donation.id}/gateway`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 403 ? dt("لا تملك صلاحية عرض بيانات البوابة") : dt("تعذّر تحميل بيانات البوابة"));
        return (await res.json()) as GatewayDetails;
      })
      .then((data) => { if (!cancelled) setDetails(data); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [donation.id]);

  if (error) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-center text-xs text-rose-700">{error}</div>;
  }
  if (!details) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        {dt("جاري تحميل بيانات البوابة...")}
      </div>
    );
  }

  const logo = details.provider ? GATEWAY_LOGOS[details.provider] : undefined;
  const providerName = details.provider ? GATEWAY_NAMES[details.provider] ?? details.provider : "—";
  const refs = gatewayReferences(details);
  const succeeded = details.txn.result === "Success" || Boolean(details.paidAt);
  const failed = details.txn.result === "Failed" || details.status === "FAILED";
  const methodLabel =
    details.paymentMethod === "CARD" ? dt("بطاقة ائتمانية")
      : details.paymentMethod === "PAYPAL" ? "PayPal"
        : details.paymentMethod === "BANK_TRANSFER" ? dt("تحويل بنكي")
          : details.paymentMethod ?? "—";
  const charged = money(details.paidAmount, details.paidCurrency);
  const requested = money(details.totalAmount, details.currency);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
        {logo ? (
          <Image src={logo.src} alt={logo.alt} width={96} height={40} className="h-10 w-auto max-w-[96px] object-contain rounded" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100"><CreditCard className="w-5 h-5 text-slate-500" /></div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{providerName}</div>
          <div className="text-[11px] text-slate-500">{methodLabel}</div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            failed ? "bg-rose-100 text-rose-700" : succeeded ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
          )}
        >
          {failed ? dt("فشلت العملية") : succeeded ? dt("تمت العملية") : dt("لم تكتمل بعد")}
        </span>
      </div>

      <Section title={dt("معرفات التتبع لدى البوابة")}>
        {refs.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {refs.map((row) => <RefCard key={row.label} row={row} />)}
          </div>
        ) : (
          <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-3 text-center text-xs text-slate-500">{dt("لم تُرجع البوابة أي معرف لهذا التبرع")}</p>
        )}
      </Section>

      <Section title={dt("نتيجة العملية")}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { label: dt("النتيجة"), value: details.txn.result },
            { label: dt("رمز الاستجابة"), value: details.txn.returnCode },
            { label: dt("نوع العملية"), value: details.txn.type },
            { label: dt("الحالة لدينا"), value: details.status },
          ].map((f) => (
            <div key={f.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-[10px] font-semibold text-slate-500">{f.label}</div>
              <div className="font-mono text-xs text-slate-800" dir="ltr">{f.value || "—"}</div>
            </div>
          ))}
        </div>
        {details.txn.errorMessage && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2.5 text-xs text-rose-800" dir="auto">
            <span className="font-semibold">{dt("رسالة البوابة:")} </span>{details.txn.errorMessage}
          </div>
        )}
      </Section>

      <Section title={dt("المبالغ والتوقيت")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[
            { label: dt("المبلغ المطلوب"), value: requested },
            { label: dt("المبلغ الذي خصمته البوابة"), value: charged },
            { label: dt("ما يعادله بالدولار"), value: money(details.amountUSD, "USD") },
            { label: dt("أُنشئ في"), value: formatDateTime(details.createdAt) },
            { label: dt("تأكد الدفع في"), value: formatDateTime(details.paidAt) },
          ]
            .filter((f) => f.value)
            .map((f) => (
              <div key={f.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-[10px] font-semibold text-slate-500">{f.label}</div>
                <div className="text-xs font-medium text-slate-800" dir="ltr">{f.value}</div>
              </div>
            ))}
        </div>
      </Section>

      {details.raw.length > 0 && (
        <Section title={dt("الاستجابة الكاملة من البوابة")}>
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <button type="button" onClick={() => setShowRaw((v) => !v)} className="text-xs font-semibold text-brand hover:underline">
                {showRaw ? dt("إخفاء التفاصيل") : dtx("عرض كل الحقول ({0})", [details.raw.length])}
              </button>
              <button
                type="button"
                onClick={() => copy(details.raw.map((e) => `${e.path}: ${e.value}`).join("\n"))}
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-brand"
              >
                <Copy className="w-3.5 h-3.5" />
                {dt("نسخ الكل")}
              </button>
            </div>
            {showRaw && (
              <div className="max-h-72 overflow-y-auto border-t border-slate-100" dir="ltr">
                <table className="w-full text-[11px]">
                  <tbody>
                    {details.raw.map((e) => (
                      <tr key={e.path} className="border-b border-slate-50 last:border-0 align-top">
                        <td className="px-3 py-1 font-mono text-slate-500 whitespace-nowrap">{e.path}</td>
                        <td className="px-3 py-1 font-mono text-slate-800 break-all">{e.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {details.rawTruncated && <p className="px-3 py-1.5 text-[10px] text-slate-400">{dt("عُرضت أول 250 قيمة فقط")}</p>}
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400">{dt("أرقام البطاقات ورموز الأمان والمفاتيح مخفية دائمًا.")}</p>
        </Section>
      )}
    </div>
  );
}

function ErrorView({ donation }: { donation: DonationDetailsTarget }) {
  const msg = donation.providerErrorMessage?.trim() || null;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 flex items-start gap-3">
        <div className="shrink-0 rounded-full bg-red-100 p-2">
          <AlertTriangle className="w-5 h-5 text-red-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-red-700 mb-1">
            {dt("رسالة المزود")}</p>
          {msg ? (
            <p className="text-sm text-red-800 leading-relaxed break-words" dir="auto">
              {msg}
            </p>
          ) : (
            <p className="text-sm text-red-700/70 italic">{dt("لم يُرجع المزود رسالة خطأ")}</p>
          )}
        </div>
        {msg && (
          <button
            type="button"
            onClick={() => copy(msg)}
            className="shrink-0 text-red-500 hover:text-red-700 p-1 rounded"
            title={dt("نسخ")}
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        {dt("تأتي هذه الرسالة مباشرةً من بوابة الدفع، ويمكن مشاركتها مع المتبرع لمعرفة سبب الفشل (مثل: رفض البنك، حد الإنفاق، رمز التحقق، عدم دعم نوع الشراء، إلخ).")}</p>
    </div>
  );
}

const TITLES: Record<Mode, { title: string; description: string }> = {
  attribution: {
    get title() { return dt("تفاصيل الإعلان"); },
    get description() { return dt("بيانات إسناد الحملة الإعلانية للمتبرع  مخفية المعرفات الفنية"); },
  },
  payment: {
    get title() { return dt("تفاصيل بوابة الدفع"); },
    get description() { return dt("ما أرجعته بوابة الدفع لهذا التبرع: معرفات التتبع والنتيجة والمبالغ"); },
  },
  error: {
    get title() { return dt("سبب فشل التبرع"); },
    get description() { return dt("رسالة الخطأ التي أرجعتها بوابة الدفع"); },
  },
};

export default function DonationDetailsDialog({ open, onOpenChange, mode, donation }: Props) {
  const meta = TITLES[mode];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={dashDir()}
        className="max-w-[640px] sm:max-w-[680px] p-0 overflow-hidden gap-0"
      >
        <DialogHeader
          className={cn(
            /* pe-12 keeps the title clear of the dialog's close button in either direction. */
            "px-5 sm:px-6 pe-12 sm:pe-12 pt-5 pb-4 border-b text-start",
            mode === "error"
              ? "bg-gradient-to-l from-red-50 to-white border-red-100"
              : mode === "payment"
                ? "bg-gradient-to-l from-[#635bff]/5 to-white border-slate-100"
                : "bg-gradient-to-l from-brand/5 to-white border-slate-100"
          )}
        >
          <DialogTitle className="text-base font-semibold text-slate-900 text-start">
            {meta.title}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 text-start mt-0.5">
            {meta.description}
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 sm:px-6 py-4 max-h-[70vh] overflow-y-auto bg-slate-50/30">
          {donation == null ? (
            <p className="text-sm text-slate-500 text-center py-8">{dt("لا توجد بيانات")}</p>
          ) : mode === "attribution" ? (
            <AttributionView donation={donation} />
          ) : mode === "payment" ? (
            <PaymentView donation={donation} />
          ) : (
            <ErrorView donation={donation} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
