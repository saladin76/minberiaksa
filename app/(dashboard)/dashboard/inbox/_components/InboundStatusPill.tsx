"use client";

import { CheckCheck, Clock, Dot, Mail, MessageCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  inboxStatusOf,
  replyUrgency,
  waitedLabel,
  INBOX_STATUS_LABELS,
  REPLY_CHANNEL_LABELS,
  type InboxStatus,
} from "@/lib/messages/inbox-status";
import type { InboundMessage } from "./inbound-types";

/**
 * The three triage states, as one chip.
 *
 * Colour carries meaning consistently across the page: brand = new and waiting for a first
 * look, amber = seen but still owes an answer, emerald = done. Each chip also carries an icon
 * and a word, so the state survives both a greyscale screenshot and a colour-blind reader.
 */
const STATUS_STYLES: Record<InboxStatus, { chip: string; Icon: typeof Sparkles }> = {
  unread: { chip: "border-transparent bg-brand text-white", Icon: Sparkles },
  pending: { chip: "border-amber-200 bg-amber-50 text-amber-700", Icon: Clock },
  replied: { chip: "border-emerald-200 bg-emerald-50 text-emerald-700", Icon: CheckCheck },
};

const CHANNEL_ICONS = { EMAIL: Mail, WHATSAPP: MessageCircle, MANUAL: Dot } as const;

export function InboundStatusPill({
  message,
  className,
  showChannel = false,
}: {
  message: InboundMessage;
  className?: string;
  /** Appends "عبر واتساب" / "بالبريد" — worth the width in the dialog, too much on a card. */
  showChannel?: boolean;
}) {
  const status = inboxStatusOf(message);
  const { chip, Icon } = STATUS_STYLES[status];
  const channel = status === "replied" && message.repliedVia ? message.repliedVia : null;
  const ChannelIcon = channel ? CHANNEL_ICONS[channel] : null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        chip,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {INBOX_STATUS_LABELS[status]}
      {showChannel && channel && ChannelIcon && (
        <>
          <span className="opacity-40" aria-hidden>
            ·
          </span>
          <ChannelIcon className="h-3 w-3" aria-hidden />
          {REPLY_CHANNEL_LABELS[channel]}
        </>
      )}
    </span>
  );
}

/**
 * How long the sender has been waiting, shown only once that starts to matter.
 *
 * Every message would otherwise carry a "waiting" label including the ones that arrived a
 * minute ago, and a label on everything ranks nothing. It appears at 24h and turns red at 72h.
 */
export function WaitingBadge({ message, className }: { message: InboundMessage; className?: string }) {
  const urgency = replyUrgency(message);
  if (urgency === "none") return null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        urgency === "overdue"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-amber-200 bg-amber-50 text-amber-700",
        className,
      )}
      title={urgency === "overdue" ? "تجاوزت ٣ أيام بلا رد" : "تجاوزت ٢٤ ساعة بلا رد"}
    >
      <Clock className="h-3 w-3" aria-hidden />
      بانتظار الرد {waitedLabel(message.createdAt)}
    </span>
  );
}
