"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MessageCircle, Search, Loader2, RefreshCw, Send, Check, CircleAlert, Clock,
  UserRound, UserX, Image as ImageIcon, Mic, FileText, MapPin, Video, Link2, Flag,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SegmentedControl, fmtDateTime, fmtFull } from "../../_shared/channel-ui";
import { cn } from "@/lib/utils";

/**
 * The WhatsApp inbox.
 *
 * Donors have always been able to reply  the archive recorded every one, and the sidebar badge
 * counted them  but there was no screen, so the replies went unread. Two decisions shape this one:
 *
 * A conversation belongs to a business number, not just to a contact, so the number a thread arrived
 * on is shown on every row rather than buried in a filter. Merging a donor's threads across two
 * numbers would put an answer to a marketing campaign under a receipt.
 *
 * And the reply box states WhatsApp's 24-hour rule before it is typed into, not after it is sent.
 * Outside that window Meta refuses free text, so a compose box that looked available would produce a
 * message the donor never receives, recorded as sent.
 */

type Donor = {
  userId: string | null;
  name: string | null;
  email: string | null;
  locale: string | null;
  country: string | null;
  totalDonations: number | null;
  lastDonationAt: string | null;
  whatsappOptIn: boolean;
  doNotContact: boolean;
};

type Sender = { id: string; name: string; phone: string | null };

type Conversation = {
  id: string;
  phone: string;
  donor: Donor | null;
  unresolved: boolean;
  handled: boolean;
  lastMessageAt: string | null;
  lastInboundText: string | null;
  needsReply: boolean;
  inboundCount: number;
  outboundCount: number;
  sender: Sender | null;
};

type Media = { kind: string; mediaId: string | null; mimeType: string | null; filename: string | null; caption: string | null };

type TimelineItem = {
  kind: "inbound" | "outbound" | "status";
  at: string | null;
  text: string | null;
  status: string | null;
  media?: Media | null;
};

type Detail = {
  id: string;
  phone: string;
  donor: Donor | null;
  unresolved: boolean;
  timeline: TimelineItem[];
  sender: Sender | null;
  hasMore: boolean;
  oldestAt: string | null;
};

type ReplyWindow = { open: boolean; lastInboundAt: string | null; remainingMs: number; lastInboundMessageId: string | null };

const FILTERS = [
  { value: "needsReply", label: "بانتظار ردّ" },
  { value: "unresolved", label: "غير مرتبطة" },
  { value: "all", label: "الكل" },
];

const MEDIA_ICONS: Record<string, typeof ImageIcon> = {
  image: ImageIcon, video: Video, audio: Mic, document: FileText, sticker: ImageIcon, location: MapPin,
};

function mediaLabel(media: Media): string {
  const names: Record<string, string> = {
    image: "صورة", video: "مقطع مرئي", audio: "رسالة صوتية", document: "ملف", sticker: "ملصق",
  };
  const base = names[media.kind] ?? media.kind;
  return media.filename ? `${base}  ${media.filename}` : base;
}

/** "٤ ساعات" left in the window, or how long ago it closed. */
function windowText(window: ReplyWindow): string {
  if (!window.lastInboundAt) return "لم يُرسل المتبرع أي رسالة بعد  الردّ يتطلّب قالبًا معتمدًا.";
  if (!window.open) return `انتهت نافذة الردّ الحر (آخر رسالة من المتبرع ${fmtFull(window.lastInboundAt)})  استخدم قالبًا معتمدًا.`;
  const hours = Math.floor(window.remainingMs / 3_600_000);
  const minutes = Math.floor((window.remainingMs % 3_600_000) / 60_000);
  return hours > 0 ? `يمكن الردّ بنص حر خلال ${hours} ساعة و${minutes} دقيقة.` : `يمكن الردّ بنص حر خلال ${minutes} دقيقة.`;
}

export function WhatsappInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [needsReply, setNeedsReply] = useState(0);
  const [filter, setFilter] = useState("needsReply");
  const [senderId, setSenderId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [loadingList, setLoadingList] = useState(true);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [replyWindow, setReplyWindow] = useState<ReplyWindow | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams({ filter });
      if (senderId) params.set("senderId", senderId);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/dashboard/communication/inbox?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "load failed");
      setConversations(data.conversations ?? []);
      setSenders(data.senders ?? []);
      setNeedsReply(data.needsReply ?? 0);
    } catch {
      setConversations([]);
    } finally {
      setLoadingList(false);
    }
  }, [filter, senderId, query]);

  useEffect(() => { void loadList(); }, [loadList]);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/dashboard/communication/inbox/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "load failed");
      setDetail(data.conversation);
      setReplyWindow(data.replyWindow);
    } catch {
      setDetail(null);
      setReplyWindow(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { if (activeId) void loadDetail(activeId); }, [activeId, loadDetail]);

  /* Newest message in view when a conversation opens  the reason anyone opened it. */
  useEffect(() => {
    const node = timelineRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [detail]);

  const act = useCallback(async (action: "handled" | "followup" | "link") => {
    if (!activeId) return;
    const res = await fetch(`/api/dashboard/communication/inbox/${encodeURIComponent(activeId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setNotice({ tone: "ok", text: action === "handled" ? "تم وسمها كمُعالَجة." : action === "followup" ? "سُجّل طلب المتابعة." : "سُجّل طلب الربط بمتبرع." });
      void loadList();
    } else {
      setNotice({ tone: "error", text: "تعذّر تنفيذ الإجراء." });
    }
  }, [activeId, loadList]);

  const sendReply = useCallback(async () => {
    if (!activeId || !draft.trim()) return;
    setSending(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/dashboard/communication/inbox/${encodeURIComponent(activeId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reply", body: draft.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        /* The window closing between load and send is the one failure an operator will actually
           hit, so it is named rather than reported as a generic error. */
        setNotice({
          tone: "error",
          text: data.error === "REPLY_WINDOW_CLOSED"
            ? "انتهت نافذة الردّ الحر قبل الإرسال  استخدم قالبًا معتمدًا."
            : `تعذّر الإرسال: ${data.error ?? "خطأ غير معروف"}`,
        });
        return;
      }
      setDraft("");
      setNotice({ tone: "ok", text: "أُرسل الردّ." });
      await loadDetail(activeId);
      void loadList();
    } finally {
      setSending(false);
    }
  }, [activeId, draft, loadDetail, loadList]);

  const senderOptions = useMemo(
    () => [{ value: "", label: "كل الأرقام" }, ...senders.map((s) => ({ value: s.id, label: s.phone ? `${s.name} · ${s.phone}` : s.name }))],
    [senders],
  );

  return (
    <div dir="rtl">
      <PageHeader
        eyebrow="التواصل"
        title="صندوق واتساب"
        description="ردود المتبرعين على رسائل واتساب، مجمّعة لكل رقم عمل على حدة."
        icon={MessageCircle}
        actions={
          <button
            type="button"
            onClick={() => void loadList()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={cn("w-4 h-4", loadingList && "animate-spin")} />
            تحديث
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl
          value={filter}
          onChange={(v) => setFilter(String(v))}
          options={FILTERS}
        />
        <select
          value={senderId}
          onChange={(e) => setSenderId(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
        >
          {senderOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="رقم، اسم، أو نصّ رسالة"
            className="w-64 rounded-lg border border-slate-200 bg-white py-1.5 pr-8 pl-3 text-sm text-slate-700 placeholder:text-slate-400"
          />
        </div>
        <span className="text-xs text-slate-500">
          {needsReply > 0 ? `${needsReply} محادثة بانتظار ردّ` : "لا شيء بانتظار ردّ"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* ── Conversation list ─────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {loadingList ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <EmptyState
              variant="inline"
              title="لا توجد محادثات"
              description={filter === "needsReply" ? "كل الردود مُعالَجة." : "لم تصل أي ردود على هذا الرقم بعد."}
            />
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {conversations.map((c) => {
                const at = fmtDateTime(c.lastMessageAt);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      className={cn(
                        "w-full text-right px-3 py-3 hover:bg-slate-50 transition-colors",
                        activeId === c.id && "bg-brand/5",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {c.donor?.name || c.phone}
                        </span>
                        {c.needsReply && (
                          <span className="shrink-0 rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            بانتظار ردّ
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 truncate">{c.lastInboundText || "—"}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        {at && <span>{at.date} · {at.time}</span>}
                        {c.sender?.phone && <span className="truncate">عبر {c.sender.phone}</span>}
                        {c.unresolved && (
                          <span className="inline-flex items-center gap-0.5 text-slate-400">
                            <UserX className="w-3 h-3" /> غير مرتبطة
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Thread ─────────────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
          {!activeId ? (
            <EmptyState variant="inline" title="اختر محادثة" description="ستظهر الرسائل وملف المتبرع هنا." />
          ) : loadingDetail && !detail ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : !detail ? (
            <EmptyState variant="inline" title="تعذّر تحميل المحادثة" />
          ) : (
            <>
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {detail.donor?.name || detail.phone}
                    </p>
                    <p className="text-xs text-slate-500">
                      {detail.phone}
                      {detail.sender?.phone ? ` · عبر ${detail.sender.phone}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {detail.donor?.userId && (
                      /* The donors screen is a list, not a per-donor page, so this hands it the
                         contact to find rather than inventing a route that does not exist. */
                      <Link
                        href={`/dashboard/users/donors?q=${encodeURIComponent(detail.donor.email || detail.phone)}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <UserRound className="w-3.5 h-3.5" /> في قائمة المتبرعين
                      </Link>
                    )}
                    <button type="button" onClick={() => void act("handled")} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <Check className="w-3.5 h-3.5" /> مُعالَجة
                    </button>
                    <button type="button" onClick={() => void act("followup")} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <Flag className="w-3.5 h-3.5" /> متابعة
                    </button>
                    {detail.unresolved && (
                      <button type="button" onClick={() => void act("link")} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        <Link2 className="w-3.5 h-3.5" /> ربط بمتبرع
                      </button>
                    )}
                  </div>
                </div>
                {detail.donor && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    {detail.donor.totalDonations != null && <span>{detail.donor.totalDonations} تبرعًا</span>}
                    {detail.donor.lastDonationAt && <span>آخر تبرع {fmtFull(detail.donor.lastDonationAt)}</span>}
                    {detail.donor.locale && <span>اللغة {detail.donor.locale}</span>}
                    {detail.donor.doNotContact && (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-700">
                        ممنوع التواصل
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div ref={timelineRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2 max-h-[52vh] bg-slate-50/50">
                {detail.hasMore && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!detail.oldestAt || !activeId) return;
                      void (async () => {
                        const res = await fetch(`/api/dashboard/communication/inbox/${encodeURIComponent(activeId)}?before=${encodeURIComponent(detail.oldestAt!)}`, { cache: "no-store" });
                        const data = await res.json();
                        if (res.ok && data.ok) {
                          /* Older page prepended, so the reader keeps their place in the thread. */
                          setDetail({ ...data.conversation, timeline: [...data.conversation.timeline, ...detail.timeline], hasMore: data.conversation.hasMore });
                        }
                      })();
                    }}
                    className="mx-auto block rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    تحميل رسائل أقدم
                  </button>
                )}
                {detail.timeline.map((item, index) => {
                  if (item.kind === "status") {
                    return (
                      <p key={index} className="text-center text-[11px] text-slate-400">
                        {item.status} · {fmtFull(item.at)}
                      </p>
                    );
                  }
                  const inbound = item.kind === "inbound";
                  const MediaIcon = item.media ? MEDIA_ICONS[item.media.kind] ?? FileText : null;
                  return (
                    <div key={index} className={cn("flex", inbound ? "justify-start" : "justify-end")}>
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                          inbound ? "bg-white border border-slate-200 text-slate-800" : "bg-brand/10 border border-brand/20 text-slate-900",
                        )}
                      >
                        {item.media && MediaIcon && (
                          /* A voice note or a photo of a receipt is a message. It used to arrive as an
                             empty bubble because only `text.body` was parsed. */
                          <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                            <MediaIcon className="w-3.5 h-3.5" />
                            {mediaLabel(item.media)}
                          </p>
                        )}
                        {item.text && <p className="whitespace-pre-wrap break-words">{item.text}</p>}
                        {!item.text && !item.media && <p className="text-slate-400">—</p>}
                        <p className="mt-1 text-[10px] text-slate-400">
                          {fmtFull(item.at)}
                          {!inbound && item.status ? ` · ${item.status}` : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 px-4 py-3">
                {replyWindow && (
                  <p className={cn(
                    "mb-2 inline-flex items-center gap-1.5 text-xs",
                    replyWindow.open ? "text-slate-500" : "text-amber-700",
                  )}>
                    {replyWindow.open ? <Clock className="w-3.5 h-3.5" /> : <CircleAlert className="w-3.5 h-3.5" />}
                    {windowText(replyWindow)}
                  </p>
                )}
                {notice && (
                  <p className={cn("mb-2 text-xs font-medium", notice.tone === "ok" ? "text-emerald-700" : "text-rose-700")}>
                    {notice.text}
                  </p>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={!replyWindow?.open || sending}
                    rows={2}
                    placeholder={replyWindow?.open ? "اكتب ردًّا…" : "الردّ الحر غير متاح الآن"}
                    className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => void sendReply()}
                    disabled={!replyWindow?.open || sending || !draft.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    إرسال
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
