import type { LucideIcon } from "lucide-react";
import { Mail, MessageCircle, MessageSquare } from "lucide-react";
import { dt } from "@/lib/dashboard/i18n";

/** One campaign row as the API returns it (a raw `CommunicationCampaign`). */
export interface CampaignRow {
  id: string;
  name: string;
  channel: string;
  purpose: string;
  status: string;
  audienceSegmentKey: string | null;
  templateGroupId: string | null;
  scheduledAt: string | null;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  clickedCount: number;
  repliedCount: number;
  donationCount: number;
  revenue: number;
  failedDonationCount?: number;
  metadata?: {
    sendControls?: {
      paused?: boolean;
      speedMode?: string;
      autoSpeed?: boolean;
      priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
      dailyCap?: number;
      scheduledStopAt?: string | null;
      resumeAt?: string | null;
      quietHours?: { enabled?: boolean; start?: string; end?: string; timezone?: string };
    };
  } | null;
  createdAt: string;
  updatedAt: string;
}

export const CHANNEL_META: Record<
  string,
  { label: string; icon: LucideIcon; href: string; tile: string; dot: string }
> = {
  EMAIL: {
    get label() { return dt("البريد الإلكتروني"); },
    icon: Mail,
    href: "/dashboard/communication/email",
    tile: "bg-brand/10 text-brand",
    dot: "bg-brand",
  },
  WHATSAPP: {
    get label() { return dt("واتساب"); },
    icon: MessageCircle,
    href: "/dashboard/communication/whatsapp",
    tile: "bg-[#25D366]/10 text-[#128C7E]",
    dot: "bg-[#25D366]",
  },
  SMS: {
    get label() { return dt("الرسائل النصية"); },
    icon: MessageSquare,
    href: "/dashboard/communication/sms",
    tile: "bg-brand-orange/10 text-brand-orange-700",
    dot: "bg-brand-orange",
  },
};

/**
 * The campaign status vocabulary, in the order the workflow actually walks it.
 *
 * `tone` deliberately separates "not sent yet" (slate) from "in flight" (amber) from "done"
 * (emerald) from "stopped" (rose): the single question anyone asks a campaign list is whether a
 * campaign has gone out, and colour answers it before the label is read.
 */
export const STATUS_META: Record<string, { label: string; tone: string }> = {
  DRAFT: { get label() { return dt("مسودة"); }, tone: "border-slate-200 bg-slate-50 text-slate-600" },
  REVIEW: { get label() { return dt("قيد المراجعة"); }, tone: "border-sky-200 bg-sky-50 text-sky-700" },
  APPROVED: { get label() { return dt("معتمدة"); }, tone: "border-violet-200 bg-violet-50 text-violet-700" },
  SCHEDULED: { get label() { return dt("مجدولة"); }, tone: "border-amber-200 bg-amber-50 text-amber-700" },
  SENDING: { get label() { return dt("جاري الإرسال"); }, tone: "border-amber-200 bg-amber-50 text-amber-700" },
  SENT: { get label() { return dt("تم الإرسال"); }, tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  CANCELLED: { get label() { return dt("ملغاة"); }, tone: "border-slate-200 bg-slate-100 text-slate-500" },
  FAILED: { get label() { return dt("فشلت"); }, tone: "border-rose-200 bg-rose-50 text-rose-700" },
  ARCHIVED: { get label() { return dt("مؤرشفة"); }, tone: "border-slate-200 bg-slate-100 text-slate-500" },
};

export const statusMeta = (s: string) => STATUS_META[s] ?? STATUS_META.DRAFT;
export const channelMeta = (c: string) => CHANNEL_META[c] ?? CHANNEL_META.EMAIL;

/** Campaigns that have not gone out yet  the ones still safe to edit or delete. */
export const isPreSend = (status: string) => ["DRAFT", "REVIEW", "APPROVED", "SCHEDULED"].includes(status);

/**
 * Describe an `audienceSegmentKey` in words.
 *
 * The field carries two different kinds of value: `list:<id>` for a hand-picked audience (what the
 * wizard creates) and a bare locale code for "every donor who reads this language" (what older
 * campaigns use). They are not the same audience and should not read the same  a campaign keyed
 * `ar` reaches 840 donors here, which is nothing like a list someone assembled by hand.
 */
export function audienceLabel(key: string | null, localeLabels: Record<string, string>): string {
  if (!key) return dt("بلا جمهور");
  if (key.startsWith("list:")) return dt("قائمة مخصّصة");
  return dt("كل المتبرعين  {0}", [localeLabels[key] ?? key]);
}

/** Campaigns with real send history worth linking through to the channel report. */
export const hasResults = (c: CampaignRow) => c.sentCount > 0 || ["SENDING", "SENT", "FAILED"].includes(c.status);
