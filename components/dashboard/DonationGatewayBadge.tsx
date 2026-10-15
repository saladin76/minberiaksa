"use client";

import Image from "next/image";
import Link from "next/link";
import { HandCoins, Landmark } from "lucide-react";
import { dt } from "@/lib/dashboard/i18n";

/** The logo each card / wallet gateway is shown with, from /public. */
export const GATEWAY_LOGOS: Record<string, { src: string; alt: string }> = {
  ALBARAKA: { src: "/albaraka.jpg", alt: "Albaraka Türk" },
  PAYFOR: { src: "/ziraat-katilim.jpg", alt: "Ziraat Katılım" },
  PAYPAL: { src: "/paypal.webp", alt: "PayPal" },
};

export const GATEWAY_NAMES: Record<string, string> = {
  ALBARAKA: "Albaraka Türk",
  PAYFOR: "Ziraat Katılım (PayFor)",
  PAYPAL: "PayPal",
  STRIPE: "Stripe",
  BANK_TRANSFER: "Bank transfer",
  MANUAL: "Manual",
};

type Props = {
  donation: { id: string; provider?: string | null; paymentMethod?: string | null; paidAt?: string | Date | null };
  /** Opens the gateway popup for this donation. */
  onOpen: () => void;
};

const BUTTON = "inline-flex items-center rounded hover:opacity-80 hover:scale-[1.03] active:scale-95 transition-all";

/**
 * The «البوابة» cell of the donation tables: the gateway's logo, opening the
 * popup with everything the gateway reported for the donation.
 */
export function DonationGatewayBadge({ donation, onOpen }: Props) {
  const provider = donation.provider ?? null;
  const logo = provider ? GATEWAY_LOGOS[provider] : undefined;

  if (logo) {
    return (
      <button type="button" onClick={onOpen} className={BUTTON} title={dt("عرض تفاصيل بوابة الدفع")}>
        <Image src={logo.src} alt={logo.alt} width={76} height={32} className="h-8 w-auto max-w-[76px] object-contain rounded border border-slate-100 bg-white" />
      </button>
    );
  }

  if (provider === "STRIPE") {
    return (
      <button type="button" onClick={onOpen} className={BUTTON} title={dt("عرض تفاصيل بوابة الدفع")}>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-[#635bff]/10 text-[#635bff]">
          Stripe
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" /></svg>
        </span>
      </button>
    );
  }

  if (provider === "BANK_TRANSFER") {
    /* Two origins share the provider: a line imported from the bank's statement,
       or a receipt a donor uploaded at checkout. Only the latter has a review to open. */
    return donation.paymentMethod === "BANK_TRANSFER" ? (
      <Link
        href={`/dashboard/transfer-receipts?claim=${donation.id}`}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-brand/10 text-brand hover:bg-brand/20 transition-colors"
        title={donation.paidAt ? dt("تحويل بنكي مؤكد  فتح الإيصال") : dt("تحويل بنكي بانتظار مطابقة الإيصال  فتح المراجعة")}
      >
        <Landmark className="w-3 h-3" />
        {dt("تحويل بنكي")}
      </Link>
    ) : (
      <button type="button" onClick={onOpen} className={BUTTON} title={dt("تبرع عبر تحويل بنكي  مستورد من كشف الحساب")}>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-brand/10 text-brand">
          <Landmark className="w-3 h-3" />
          {dt("تحويل بنكي")}
        </span>
      </button>
    );
  }

  if (provider === "MANUAL") {
    return (
      <button type="button" onClick={onOpen} className={BUTTON} title={dt("تبرع أُضيف يدويًا من لوحة التحكم")}>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600">
          <HandCoins className="w-3 h-3" />
          {dt("يدوي")}
        </span>
      </button>
    );
  }

  if (provider) {
    return (
      <button type="button" onClick={onOpen} className={BUTTON} title={dt("عرض تفاصيل بوابة الدفع")}>
        <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600" dir="ltr">{provider}</span>
      </button>
    );
  }

  return <span className="text-slate-400 text-xs">—</span>;
}
