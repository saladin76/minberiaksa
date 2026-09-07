"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Globe, Phone, UserCheck, UserRound } from "lucide-react";
import { subjectLabel } from "@/lib/messages/subjects";
import { LOCALE_LABELS } from "@/lib/locales";
import { cn } from "@/lib/utils";
import { inboxStatusOf, replyUrgency } from "@/lib/messages/inbox-status";
import { type InboundMessage, senderOf, relativeTime, absoluteDate } from "./inbound-types";
import { InboundStatusPill, WaitingBadge } from "./InboundStatusPill";

/**
 * One inbound message, as a card.
 *
 * Replaces a six-column table. A table implies you scan down a column to compare values, but the
 * only column anyone actually reads here is the message body — and that was the one truncated to a
 * single line inside a 240px cell. Below `lg` the table also just became a horizontal scroll box,
 * so on a phone the body column was the part you had to drag sideways to reach.
 *
 * The whole card is the button rather than a trailing «عرض» link: the entire surface is the target,
 * which matters most on touch, and it keeps a single focus stop per message instead of one row plus
 * one nested control.
 *
 * Unread cards are weighted the way an unread mail row is anywhere else — a brand rail down the
 * leading edge, a tinted header, a bolder name — so a full grid can be triaged by shape alone,
 * before reading a single word. Answered cards are deliberately quietened to the opposite end:
 * they are still there to search, but they stop competing for attention.
 */
export function InboundMessageCard({
  message,
  locale,
  onOpen,
}: {
  message: InboundMessage;
  locale: string;
  onOpen: () => void;
}) {
  const sender = senderOf(message);
  const localeLabel = LOCALE_LABELS[message.locale as keyof typeof LOCALE_LABELS] ?? message.locale;
  const status = inboxStatusOf(message);
  const unread = status === "unread";
  const replied = status === "replied";
  const urgency = replyUrgency(message);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-xl border text-start",
        "transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
        unread ? "border-brand-200 bg-white shadow-sm" : "border-slate-200 bg-white",
        replied && "opacity-90 hover:opacity-100",
      )}
      aria-label={`عرض رسالة من ${sender.displayName}`}
    >
      {/* Leading rail. `start-0` rather than left/right so it follows the RTL shell. */}
      {(unread || urgency !== "none") && (
        <span
          className={cn(
            "absolute inset-y-0 start-0 w-1",
            unread ? "bg-brand" : urgency === "overdue" ? "bg-rose-400" : "bg-amber-400",
          )}
          aria-hidden
        />
      )}

      <div
        className={cn(
          "flex items-start gap-2.5 border-b p-3",
          unread ? "border-brand-100 bg-brand-50/40" : "border-slate-100",
        )}
      >
        <Avatar className="h-9 w-9 shrink-0 rounded-full ring-1 ring-slate-200">
          <AvatarImage src={sender.image ?? undefined} alt="" />
          <AvatarFallback
            className={cn(
              "rounded-full text-xs font-bold text-white",
              sender.isRegistered
                ? "bg-gradient-to-br from-brand-400 to-brand-700"
                : "bg-gradient-to-br from-slate-400 to-slate-600",
            )}
          >
            {sender.initial}
          </AvatarFallback>
        </Avatar>

        {/* min-w-0 is what lets the long email truncate instead of stretching the card. */}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "flex items-center gap-1 truncate text-[13px] text-slate-900",
              unread ? "font-extrabold" : "font-semibold",
            )}
          >
            {sender.isRegistered ? (
              <UserCheck className="h-3.5 w-3.5 shrink-0 text-brand" aria-label="مستخدم مسجل" />
            ) : (
              <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="زائر" />
            )}
            <span className="truncate">{sender.displayName}</span>
          </p>
          <p className="truncate text-[11px] text-slate-500" title={sender.email ?? undefined}>
            {sender.email ?? "بلا بريد"}
          </p>
        </div>

        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600"
          title={`لغة الرسالة: ${localeLabel}`}
        >
          <Globe className="h-3 w-3" />
          {localeLabel}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex max-w-full items-center truncate rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
            {subjectLabel(message.subject, locale)}
          </span>
          {/* A reachable number is a reason to open this one first — it means a reply can go out
              on WhatsApp rather than into an inbox that may never be checked. */}
          {message.phone && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
              title={message.whatsapp ? "يمكن الرد عبر واتساب" : "رقم متاح للتواصل"}
            >
              <Phone className="h-3 w-3" />
              {message.whatsapp ? "واتساب" : "هاتف"}
            </span>
          )}
        </div>
        {/* line-clamp-4 instead of a one-line truncate: four lines is enough to tell a real
            enquiry from spam without opening it. */}
        <p
          className={cn(
            "line-clamp-4 whitespace-pre-wrap break-words text-[13px] leading-6",
            unread ? "text-slate-900" : "text-slate-700",
          )}
        >
          {message.body}
        </p>
      </div>

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t px-3 py-2",
          unread ? "border-brand-100 bg-brand-50/30" : "border-slate-100 bg-slate-50/60",
        )}
      >
        <span className="truncate text-[11px] text-slate-500" title={absoluteDate(message.createdAt, "long")}>
          {relativeTime(message.createdAt)}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <WaitingBadge message={message} />
          <InboundStatusPill message={message} />
        </span>
      </div>
    </button>
  );
}
