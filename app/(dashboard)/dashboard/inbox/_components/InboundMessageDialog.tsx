"use client";

import * as React from "react";
import { toast } from "react-hot-toast";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  X,
  Globe,
  Calendar,
  Copy,
  Reply,
  UserCheck,
  UserRound,
  MessageCircle,
  Check,
  RotateCcw,
  Loader2,
  Phone,
} from "lucide-react";
import { subjectLabel } from "@/lib/messages/subjects";
import { LOCALE_LABELS } from "@/lib/locales";
import { cn } from "@/lib/utils";
import {
  inboxStatusOf,
  whatsappUrl,
  REPLY_CHANNEL_LABELS,
  type MessageReplyChannel,
} from "@/lib/messages/inbox-status";
import { type InboundMessage, senderOf, absoluteDate, relativeTime } from "./inbound-types";
import { InboundStatusPill, WaitingBadge } from "./InboundStatusPill";

export type TriageAction = "read" | "unread" | "replied" | "unreplied";

/**
 * The full message.
 *
 * The point of opening a message is answering it, so the footer is the reply bar. It offers the
 * two channels this inbox can actually reach the sender on, and — because most replies happen
 * outside this app — a way to record that it was handled at all.
 *
 * Replying is a one-way trip out of the dashboard (a `mailto:` or a wa.me tab), so there is no
 * completion event to listen for. Both buttons therefore mark the message answered as they open
 * the channel, and the state is reversible from the same footer if the reply never got sent.
 * The alternative — trusting the admin to come back and tick a box — is exactly the habit that
 * leaves an inbox with no reliable "answered" signal at all.
 */
export function InboundMessageDialog({
  message,
  locale,
  onClose,
  onTriage,
}: {
  message: InboundMessage | null;
  locale: string;
  onClose: () => void;
  onTriage: (id: string, action: TriageAction, via?: MessageReplyChannel) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState<TriageAction | null>(null);

  const copy = React.useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label);
    } catch {
      toast.error("تعذّر النسخ");
    }
  }, []);

  const run = React.useCallback(
    async (id: string, action: TriageAction, via?: MessageReplyChannel) => {
      setBusy(action);
      try {
        await onTriage(id, action, via);
      } finally {
        setBusy(null);
      }
    },
    [onTriage],
  );

  // Hooks must run on every render, so the early return sits below them.
  if (!message) return null;

  const sender = senderOf(message);
  const localeLabel = LOCALE_LABELS[message.locale as keyof typeof LOCALE_LABELS] ?? message.locale;
  const replySubject = `رد على رسالتك — ${subjectLabel(message.subject, locale)}`;
  const whatsappText = `مرحبًا ${sender.name ?? ""}، نتواصل معك بخصوص رسالتك «${subjectLabel(
    message.subject,
    locale,
  )}».`.replace(/\s+،/, "،");
  const status = inboxStatusOf(message);
  const replied = status === "replied";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideCloseButton
        dir="rtl"
        className="flex max-h-[88vh] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-slate-200 p-4">
          <Avatar className="h-11 w-11 shrink-0 rounded-full ring-2 ring-white shadow-sm">
            <AvatarImage src={sender.image ?? undefined} alt="" />
            <AvatarFallback
              className={cn(
                "rounded-full text-sm font-semibold text-white",
                sender.isRegistered
                  ? "bg-gradient-to-br from-brand-400 to-brand-700"
                  : "bg-gradient-to-br from-slate-400 to-slate-600",
              )}
            >
              {sender.initial}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <DialogTitle className="flex items-center gap-1.5 truncate text-[15px] font-bold text-slate-900">
              {sender.isRegistered ? (
                <UserCheck className="h-4 w-4 shrink-0 text-brand" />
              ) : (
                <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
              )}
              <span className="truncate">{sender.displayName}</span>
            </DialogTitle>
            <DialogDescription className="truncate text-xs text-slate-500">
              {sender.email ?? "بلا بريد"}
            </DialogDescription>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <InboundStatusPill message={message} showChannel />
              <WaitingBadge message={message} />
              <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                {subjectLabel(message.subject, locale)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                <Globe className="h-3 w-3" />
                {localeLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                <Calendar className="h-3 w-3" />
                {absoluteDate(message.createdAt, "long")}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="-me-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <p className="whitespace-pre-wrap break-words text-[14px] leading-7 text-slate-800">
            {message.body}
          </p>

          {/* The number used to be buried in the last line of the body text. It is contact
              information, so it belongs beside the reply controls, not inside the prose. */}
          {message.phone && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700" dir="ltr">
                {message.phone}
              </span>
              <button
                type="button"
                onClick={() => copy(message.phone!, "تم نسخ الرقم")}
                className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                aria-label="نسخ رقم الهاتف"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {replied && (
          <div className="flex shrink-0 items-center gap-2 border-t border-emerald-100 bg-emerald-50/70 px-4 py-2 text-[12px] text-emerald-800">
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              تم الرد {message.repliedVia ? REPLY_CHANNEL_LABELS[message.repliedVia] : ""}
              {message.repliedByName ? ` — ${message.repliedByName}` : ""}
              {message.repliedAt ? ` · ${relativeTime(message.repliedAt)}` : ""}
            </span>
            <button
              type="button"
              onClick={() => run(message.id, "unreplied")}
              disabled={busy !== null}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-emerald-700 underline underline-offset-2 transition-colors hover:text-emerald-900 disabled:opacity-50"
            >
              {busy === "unreplied" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              تراجع
            </button>
          </div>
        )}

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/80 px-4 py-3">
          {!replied && (
            <div className="me-auto flex items-center gap-2">
              {/* Most replies to this inbox go out by phone or from someone's own mail client,
                  where the app can see nothing. Without a way to say "this is handled" by hand,
                  those messages would sit in بانتظار الرد forever. */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={busy !== null}
                onClick={() => run(message.id, "replied", "MANUAL")}
              >
                {busy === "replied" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                تحديد كمردود عليه
              </Button>
              {/* The counterpart to opening a message marking it seen: a way to put one back on
                  the pile after skimming it, instead of it silently leaving the badge. */}
              {message.readAt && (
                <button
                  type="button"
                  onClick={() => run(message.id, "unread")}
                  disabled={busy !== null}
                  className="text-[11px] text-slate-500 underline underline-offset-2 transition-colors hover:text-slate-800 disabled:opacity-50"
                >
                  تحديد كغير مقروءة
                </button>
              )}
            </div>
          )}

          {sender.email && (
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a
                href={`mailto:${sender.email}?subject=${encodeURIComponent(replySubject)}`}
                onClick={() => run(message.id, "replied", "EMAIL")}
              >
                <Reply className="h-3.5 w-3.5" />
                رد بالبريد
              </a>
            </Button>
          )}

          {message.whatsapp ? (
            <Button size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700" asChild>
              <a
                href={whatsappUrl(message.whatsapp, whatsappText)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => run(message.id, "replied", "WHATSAPP")}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                رد واتساب
              </a>
            </Button>
          ) : (
            // A number we could not resolve to E.164 would produce a wa.me link to nobody, so
            // the admin gets the number to dial instead of a button that silently fails.
            message.phone && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => copy(message.phone!, "تم نسخ الرقم")}
                title="الرقم غير مكتوب بصيغة دولية، لذا لا يمكن فتح واتساب مباشرة"
              >
                <Copy className="h-3.5 w-3.5" />
                نسخ الرقم
              </Button>
            )
          )}

          {!sender.email && !message.phone && (
            <span className="text-[12px] text-slate-500">لا توجد وسيلة تواصل مع هذا المرسل</span>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
