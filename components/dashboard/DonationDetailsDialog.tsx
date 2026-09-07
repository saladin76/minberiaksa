"use client";

import { useMemo } from "react";
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
} from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import {
  detectDonationSource,
  PLATFORM_LABEL_AR,
  STATUS_LABEL_AR,
  type DonationSourceStatus,
} from "@/lib/attribution/detect-source";

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
  { key: "utm_campaign", label: "الحملة الإعلانية", Icon: Megaphone, hint: "اسم الحملة في إدارة الإعلانات" },
  { key: "utm_source", label: "المصدر", Icon: Globe, hint: "Facebook / Google / TikTok …" },
  { key: "utm_medium", label: "الوسيلة", Icon: Target, hint: "cpc / social / email …" },
  { key: "utm_content", label: "محتوى الإعلان", Icon: Filter },
  { key: "utm_term", label: "الكلمة المفتاحية", Icon: Filter },
  { key: "objective", label: "الهدف", Icon: Compass },
  { key: "funnel", label: "مرحلة القمع", Icon: Filter },
  { key: "placement", label: "موضع الإعلان", Icon: MonitorSmartphone },
  { key: "audience_type", label: "نوع الجمهور", Icon: Users },
  { key: "target_country", label: "دولة الاستهداف", Icon: Map },
  { key: "target_region", label: "منطقة الاستهداف", Icon: Map },
  { key: "language", label: "اللغة", Icon: Languages },
  { key: "device", label: "الجهاز", Icon: Laptop },
  { key: "platform", label: "المنصة", Icon: MonitorSmartphone },
  { key: "landing_page", label: "صفحة الهبوط", Icon: Link2, span: 2, ltr: true },
  { key: "referrer", label: "المُحيل", Icon: CornerDownLeft, span: 2, ltr: true },
  { key: "user_agent", label: "متصفح الزائر", Icon: Laptop, span: 2, ltr: true },
  { key: "client_ip", label: "عنوان IP", Icon: Network, ltr: true },
];

function copy(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  navigator.clipboard.writeText(value).then(
    () => toast.success("تم النسخ"),
    () => toast.error("تعذّر النسخ")
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
          title="نسخ"
          aria-label={`نسخ ${def.label}`}
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
        <div className="text-[11px] font-medium opacity-80">الثقة {result.confidence}%</div>
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

    // Anything unknown (and not an ID) — surface with a generic icon so admins
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
            لا توجد بيانات إسناد إعلاني لهذا التبرع
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            ربما وصل المتبرع مباشرةً دون إعلان متتبَّع
          </p>
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

function PaymentView({ donation }: { donation: DonationDetailsTarget }) {
  const provider = donation.provider ?? null;
  const orderId = donation.providerOrderId ?? null;
  const method = donation.paymentMethod ?? null;

  const providerLabel =
    provider === "STRIPE"
      ? "Stripe"
      : provider === "PAYFOR"
        ? "PayFor (Ziraat)"
        : provider === "ALBARAKA"
          ? "Albaraka Türk"
          : provider ?? "—";

  const methodLabel =
    method === "CARD" ? "بطاقة ائتمانية" : method === "PAYPAL" ? "PayPal" : method ?? "—";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <FieldCard
          def={{ label: "بوابة الدفع", Icon: CreditCard, hint: "المزود الذي عالج هذا التبرع" }}
          value={providerLabel}
        />
        <FieldCard
          def={{ label: "طريقة الدفع", Icon: CreditCard }}
          value={methodLabel}
        />
        {orderId && (
          <FieldCard
            def={{
              label: "معرف الطلب لدى البوابة",
              Icon: Hash,
              span: 2,
              ltr: true,
              hint: "يستخدم لمطابقة التبرع مع لوحة تحكم المزود",
            }}
            value={orderId}
          />
        )}
      </div>
      {!provider && !orderId && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-3 text-center text-xs text-slate-500">
          لم يُسجَّل أي مزود دفع لهذا التبرع بعد
        </div>
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
            رسالة المزود
          </p>
          {msg ? (
            <p className="text-sm text-red-800 leading-relaxed break-words" dir="auto">
              {msg}
            </p>
          ) : (
            <p className="text-sm text-red-700/70 italic">لم يُرجع المزود رسالة خطأ</p>
          )}
        </div>
        {msg && (
          <button
            type="button"
            onClick={() => copy(msg)}
            className="shrink-0 text-red-500 hover:text-red-700 p-1 rounded"
            title="نسخ"
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        تأتي هذه الرسالة مباشرةً من بوابة الدفع، ويمكن مشاركتها مع المتبرع لمعرفة سبب الفشل
        (مثل: رفض البنك، حد الإنفاق، رمز التحقق، عدم دعم نوع الشراء، إلخ).
      </p>
    </div>
  );
}

const TITLES: Record<Mode, { title: string; description: string }> = {
  attribution: {
    title: "تفاصيل الإعلان",
    description: "بيانات إسناد الحملة الإعلانية للمتبرع — مخفية المعرفات الفنية",
  },
  payment: {
    title: "تفاصيل بوابة الدفع",
    description: "المزود وطريقة الدفع ومعرف الطلب لدى البوابة",
  },
  error: {
    title: "سبب فشل التبرع",
    description: "رسالة الخطأ التي أرجعتها بوابة الدفع",
  },
};

export default function DonationDetailsDialog({ open, onOpenChange, mode, donation }: Props) {
  const meta = TITLES[mode];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-w-[640px] sm:max-w-[680px] p-0 overflow-hidden gap-0"
      >
        <DialogHeader
          className={cn(
            "px-5 sm:px-6 pt-5 pb-4 border-b text-right",
            mode === "error"
              ? "bg-gradient-to-l from-red-50 to-white border-red-100"
              : mode === "payment"
                ? "bg-gradient-to-l from-[#635bff]/5 to-white border-slate-100"
                : "bg-gradient-to-l from-brand/5 to-white border-slate-100"
          )}
        >
          <DialogTitle className="text-base font-semibold text-slate-900 text-right">
            {meta.title}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 text-right mt-0.5">
            {meta.description}
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 sm:px-6 py-4 max-h-[70vh] overflow-y-auto bg-slate-50/30">
          {donation == null ? (
            <p className="text-sm text-slate-500 text-center py-8">لا توجد بيانات</p>
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
