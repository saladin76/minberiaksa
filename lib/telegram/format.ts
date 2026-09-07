import { htmlEscape } from "./client";
import { getCountryDisplayNameFromCode } from "@/lib/dashboard/country-display-name";
import { describeFailureInArabic } from "./failure-reason-ar";

/** Shape of a donation row this module knows how to render. Mirrors the
 *  Prisma row we fetch in {@link notify.ts} and {@link commands.ts}. */
export interface FormattableDonation {
  id: string;
  amount: number;
  amountUSD: number | null;
  currency: string;
  totalAmount: number;
  teamSupport: number;
  fees: number;
  status: string;
  paidAt: Date | string | null;
  createdAt: Date | string;
  subscriptionId: string | null;
  provider: string | null;
  providerOrderId: string | null;
  providerErrorMessage: string | null;
  /** Gateway return code + raw payload — inputs to the Arabic failure-reason mapper. */
  providerProcReturnCode?: string | null;
  providerRaw?: unknown;
  paymentMethod: string | null;
  donorCountryCode: string | null;
  attribution: Record<string, unknown> | null;
  /** Optional so callers that build this shape without it still typecheck. */
  donorId?: string;
  donor: { name: string | null; email: string; phone: string | null } | null;
  items: Array<{ campaign: { title: string } }>;
  categoryItems: Array<{ category: { name: string } }>;
  referral: { code: string; name: string | null } | null;
}

function flagEmoji(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode.length !== 2) return "";
  const cc = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

function formatMoneyLocal(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${formatted} ${currency}`;
}

function formatMoneyUSD(amountUSD: number | null | undefined): string {
  if (amountUSD == null || amountUSD <= 0) return "";
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amountUSD);
  return `$${formatted}`;
}

/** "May 12, 2026 · 14:35 TR" in Europe/Istanbul. */
function formatIstanbulDateTime(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const date = dt.toLocaleDateString("en-US", {
    dateStyle: "medium",
    timeZone: "Europe/Istanbul",
  });
  const time = dt.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Istanbul",
  });
  return `${date} · ${time} TR`;
}

function statusBadge(d: { status: string; paidAt: Date | string | null }): { emoji: string; label: string } {
  if (d.status === "PAID" && d.paidAt) return { emoji: "✅", label: "ناجح" };
  if (d.status === "PAID" && !d.paidAt) return { emoji: "⏳", label: "قيد التأكيد" };
  if (d.status === "FAILED") return { emoji: "❌", label: "فاشل" };
  return { emoji: "🕓", label: "معلق" };
}

function providerLabel(d: { provider: string | null; paymentMethod: string | null }): string {
  const p =
    d.provider === "STRIPE"
      ? "Stripe"
      : d.provider === "PAYFOR"
        ? "PayFor (Ziraat)"
        : d.provider === "ALBARAKA"
          ? "Albaraka Türk"
          : d.provider ?? "—";
  const m = d.paymentMethod === "CARD" ? "Card" : d.paymentMethod === "PAYPAL" ? "PayPal" : d.paymentMethod ?? "";
  return m ? `${p} · ${m}` : p;
}

/** wa.me only accepts digits — strip "+", spaces, dashes, parens. */
function whatsappDigits(phone: string): string {
  return phone.replace(/\D+/g, "");
}

function donorLine(donor: { name: string | null; email: string; phone: string | null } | null): string {
  if (!donor) return "—";
  const name = donor.name?.trim() || "Guest";
  const rawPhone = donor.phone?.trim() ?? "";
  if (!rawPhone) return htmlEscape(name);
  const digits = whatsappDigits(rawPhone);
  // No usable digits — show the raw value so the admin still sees something.
  if (!digits) return `${htmlEscape(name)} (${htmlEscape(rawPhone)})`;
  return `${htmlEscape(name)} (<a href="https://wa.me/${digits}">${htmlEscape(rawPhone)}</a>)`;
}

function countryLine(code: string | null): string {
  if (!code) return "—";
  const flag = flagEmoji(code);
  const name = getCountryDisplayNameFromCode(code, "ar") || code;
  return `${flag} ${htmlEscape(name)}`.trim();
}

function targetLine(d: FormattableDonation): string {
  const campaigns = d.items.map((i) => i.campaign.title).filter(Boolean);
  if (campaigns.length > 0) return htmlEscape(campaigns.join("، "));
  const cats = d.categoryItems.map((i) => i.category.name).filter(Boolean);
  if (cats.length > 0) return `فئة: ${htmlEscape(cats.join("، "))}`;
  return "—";
}

function adCampaignLine(d: FormattableDonation): string | null {
  const attr = d.attribution ?? {};
  const u = typeof attr.utm_campaign === "string" ? attr.utm_campaign : "";
  const s = typeof attr.utm_source === "string" ? attr.utm_source : "";
  if (!u && !s) return null;
  return [u, s ? `(${s})` : ""].filter(Boolean).map(htmlEscape).join(" ");
}

export interface DonationNotificationOptions {
  /**
   * Donor has no other successful donation — marks the name with a star instead
   * of the separate "first donation" banner this used to post as a second message.
   */
  isNewDonor?: boolean;
}

/**
 * Notification card for a single donation. Used for DONATION_PAID and DONATION_FAILED.
 * Keep it scan-friendly: emojis lead each line so the eye finds amount/donor fast.
 */
export function formatDonationNotification(
  d: FormattableDonation,
  options: DonationNotificationOptions = {}
): string {
  const status = statusBadge(d);
  const headline = d.status === "FAILED" ? "تبرع فاشل" : d.paidAt ? "تبرع جديد ناجح" : "تبرع جديد قيد التأكيد";
  const lines: string[] = [];

  lines.push(`<b>${status.emoji} ${headline}</b>`);
  lines.push("");

  // المبلغ — show local + USD if different
  const local = formatMoneyLocal(d.totalAmount || d.amount, d.currency);
  const usd = formatMoneyUSD(d.amountUSD);
  const amountLine = usd && d.currency !== "USD" ? `${local} (≈ ${usd})` : local;
  lines.push(`💰 <b>المبلغ:</b> ${htmlEscape(amountLine)}`);

  // ⭐ = first-time donor. Inline on the donor line rather than a second message.
  lines.push(`👤 <b>المتبرع:</b> ${options.isNewDonor ? "⭐ " : ""}${donorLine(d.donor)}`);
  lines.push(`🌍 <b>الدولة:</b> ${countryLine(d.donorCountryCode)}`);
  lines.push(`🎯 <b>الوجهة:</b> ${targetLine(d)}`);
  lines.push(
    `🏦 <b>البوابة:</b> ${htmlEscape(providerLabel(d))}${
      d.subscriptionId ? " · 🔁 شهري" : ""
    }`
  );

  if (d.referral) {
    const ref = d.referral.name ? `${d.referral.name} (${d.referral.code})` : d.referral.code;
    lines.push(`🔗 <b>الإحالة:</b> ${htmlEscape(ref)}`);
  }

  const ad = adCampaignLine(d);
  if (ad) lines.push(`📣 <b>الإعلان:</b> ${ad}`);

  if (d.status === "FAILED") {
    // Always Arabic — the gateway localises this to the DONOR's checkout language,
    // which is meaningless to the admins reading this channel.
    lines.push("");
    lines.push(`⚠️ <b>سبب الفشل:</b> <i>${htmlEscape(describeFailureInArabic(d))}</i>`);
  }

  return lines.join("\n");
}

/** Long-form details block used by the /donation <id> command. */
export function formatDonationDetails(d: FormattableDonation): string {
  // For details we want everything — reuse notification + raw fields the brief skips.
  const base = formatDonationNotification(d);
  const extras: string[] = [];
  if (d.providerOrderId) extras.push(`🆔 <b>Order ID:</b> <code>${htmlEscape(d.providerOrderId)}</code>`);
  if (d.teamSupport && d.teamSupport > 0) {
    extras.push(`🤝 <b>دعم الفريق:</b> ${htmlEscape(formatMoneyLocal(d.teamSupport, d.currency))}`);
  }
  if (d.fees && d.fees > 0) {
    extras.push(`💳 <b>الرسوم:</b> ${htmlEscape(formatMoneyLocal(d.fees, d.currency))}`);
  }
  return extras.length > 0 ? `${base}\n\n${extras.join("\n")}` : base;
}

// ───────────────────────────────────────────────────────────── stats blocks ──

export interface StatsSnapshot {
  periodLabel: string;
  paidCount: number;
  paidTotalUSD: number;
  failedCount: number;
  pendingCount: number;
  oneTimeCount: number;
  monthlyCount: number;
  topCampaigns: Array<{ title: string; total: number; count: number }>;
}

export function formatStatsSnapshot(s: StatsSnapshot): string {
  const lines: string[] = [];
  lines.push(`📊 <b>إحصائيات — ${htmlEscape(s.periodLabel)}</b>`);
  lines.push("");
  lines.push(`✅ <b>ناجح:</b> ${s.paidCount} تبرع · ${formatMoneyUSD(s.paidTotalUSD) || "$0"}`);
  if (s.failedCount > 0) lines.push(`❌ <b>فاشل:</b> ${s.failedCount}`);
  if (s.pendingCount > 0) lines.push(`⏳ <b>قيد التأكيد:</b> ${s.pendingCount}`);
  lines.push("");
  lines.push(`🔹 مرة واحدة: ${s.oneTimeCount} · 🔁 شهري: ${s.monthlyCount}`);
  if (s.topCampaigns.length > 0) {
    lines.push("");
    lines.push("<b>أعلى المشاريع:</b>");
    for (const c of s.topCampaigns.slice(0, 5)) {
      lines.push(`  • ${htmlEscape(c.title)} — ${formatMoneyUSD(c.total) || "$0"} (${c.count})`);
    }
  }
  return lines.join("\n");
}

export function formatHelp(): string {
  return [
    "<b>🤖 بوت تبرعات الجمعية</b>",
    "",
    "<b>الإحصائيات</b>",
    "<code>/today</code> — تبرعات اليوم",
    "<code>/week</code> — آخر ٧ أيام",
    "<code>/month</code> — آخر ٣٠ يوم",
    "<code>/total</code> — الإجمالي الكلي",
    "",
    "<b>قوائم</b>",
    "<code>/failed</code> — آخر التبرعات الفاشلة",
    "<code>/pending</code> — قيد التأكيد",
    "<code>/recent</code> — آخر التبرعات الناجحة",
    "",
    "<b>بحث</b>",
    "<code>/donation &lt;id&gt;</code> — تفاصيل تبرع",
    "<code>/donor &lt;email|name&gt;</code> — بحث متبرع",
    "<code>/campaign &lt;اسم&gt;</code> — أعلى التبرعات لمشروع",
    "",
    "<code>/help</code> — هذه القائمة",
  ].join("\n");
}

export function formatDonorSummary(donor: {
  name: string | null;
  email: string;
  donationsCount: number;
  totalUSD: number;
  lastDonationAt: Date | null;
  countryCode: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`👤 <b>${htmlEscape(donor.name?.trim() || "Guest")}</b>`);
  lines.push(`<code>${htmlEscape(donor.email)}</code>`);
  if (donor.countryCode) lines.push(`🌍 ${countryLine(donor.countryCode)}`);
  lines.push("");
  lines.push(
    `✅ ${donor.donationsCount} تبرع ناجح — ${formatMoneyUSD(donor.totalUSD) || "$0"}`
  );
  if (donor.lastDonationAt) {
    lines.push(`🕒 آخر تبرع: ${htmlEscape(formatIstanbulDateTime(donor.lastDonationAt))}`);
  }
  return lines.join("\n");
}

export { formatIstanbulDateTime, formatMoneyUSD, formatMoneyLocal };
