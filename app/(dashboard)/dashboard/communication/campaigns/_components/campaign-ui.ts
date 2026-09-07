import type { LucideIcon } from "lucide-react";
import { Mail, MessageCircle, MessageSquare } from "lucide-react";

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
  createdAt: string;
  updatedAt: string;
}

export const CHANNEL_META: Record<
  string,
  { label: string; icon: LucideIcon; href: string; tile: string; dot: string }
> = {
  EMAIL: {
    label: "البريد الإلكتروني",
    icon: Mail,
    href: "/dashboard/communication/email",
    tile: "bg-brand/10 text-brand",
    dot: "bg-brand",
  },
  WHATSAPP: {
    label: "واتساب",
    icon: MessageCircle,
    href: "/dashboard/communication/whatsapp",
    tile: "bg-[#25D366]/10 text-[#128C7E]",
    dot: "bg-[#25D366]",
  },
  SMS: {
    label: "الرسائل النصية",
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
  DRAFT: { label: "مسودة", tone: "border-slate-200 bg-slate-50 text-slate-600" },
  REVIEW: { label: "قيد المراجعة", tone: "border-sky-200 bg-sky-50 text-sky-700" },
  APPROVED: { label: "معتمدة", tone: "border-violet-200 bg-violet-50 text-violet-700" },
  SCHEDULED: { label: "مجدولة", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  SENDING: { label: "جاري الإرسال", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  SENT: { label: "تم الإرسال", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  CANCELLED: { label: "ملغاة", tone: "border-slate-200 bg-slate-100 text-slate-500" },
  FAILED: { label: "فشلت", tone: "border-rose-200 bg-rose-50 text-rose-700" },
  ARCHIVED: { label: "مؤرشفة", tone: "border-slate-200 bg-slate-100 text-slate-500" },
};

export const statusMeta = (s: string) => STATUS_META[s] ?? STATUS_META.DRAFT;
export const channelMeta = (c: string) => CHANNEL_META[c] ?? CHANNEL_META.EMAIL;

/** Campaigns that have not gone out yet — the ones still safe to edit or delete. */
export const isPreSend = (status: string) => ["DRAFT", "REVIEW", "APPROVED", "SCHEDULED"].includes(status);

/**
 * Describe an `audienceSegmentKey` in words.
 *
 * The field carries two different kinds of value: `list:<id>` for a hand-picked audience (what the
 * wizard creates) and a bare locale code for "every donor who reads this language" (what older
 * campaigns use). They are not the same audience and should not read the same — a campaign keyed
 * `ar` reaches 840 donors here, which is nothing like a list someone assembled by hand.
 */
export function audienceLabel(key: string | null, localeLabels: Record<string, string>): string {
  if (!key) return "بلا جمهور";
  if (key.startsWith("list:")) return "قائمة مخصّصة";
  return `كل المتبرعين — ${localeLabels[key] ?? key}`;
}

/** Campaigns with real send history worth linking through to the channel report. */
export const hasResults = (c: CampaignRow) => c.sentCount > 0 || ["SENDING", "SENT", "FAILED"].includes(c.status);
