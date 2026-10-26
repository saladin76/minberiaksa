"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  MessageCircle, Search, Loader2, RefreshCw, Send, Check, CircleAlert, Clock,
  UserRound, UserX, Image as ImageIcon, Mic, FileText, MapPin, Video, Link2, Flag,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SegmentedControl, fmtDateTime, fmtFull } from "../../_shared/channel-ui";
import { cn } from "@/lib/utils";
import { SmartWhatsappDialog } from "@/components/dashboard/SmartWhatsappDialog";
import { dashDir, dt, dtx } from "@/lib/dashboard/i18n";
import { mergeInboxTimeline } from "@/lib/communication/inbox-timeline";

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

type WhatsappPreview = {
  header: {
    type: "text" | "image" | "video" | "document" | "location";
    text?: string | null;
    mediaUrl?: string | null;
    fileName?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    address?: string | null;
    name?: string | null;
  } | null;
  body: string;
  footerText: string | null;
  buttons: Array<{
    type: string;
    text: string;
    url?: string | null;
    phoneNumber?: string | null;
    payload?: string | null;
    index: number;
  }>;
  providerTemplateName: string | null;
  languageCode: string | null;
};

type TimelineItem = {
  id: string;
  kind: "inbound" | "outbound" | "status";
  at: string | null;
  text: string | null;
  status: string | null;
  media?: Media | null;
  whatsappPreview?: WhatsappPreview | null;
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
  { value: "needsReply", get label() { return dt("بانتظار ردّ"); } },
  { value: "unresolved", get label() { return dt("غير مرتبطة"); } },
  { value: "all", get label() { return dt("الكل"); } },
];

const MEDIA_ICONS: Record<string, typeof ImageIcon> = {
  image: ImageIcon, video: Video, audio: Mic, document: FileText, sticker: ImageIcon, location: MapPin,
};

function mediaLabel(media: Media): string {
  const names: Record<string, string> = {
    image: dt("صورة"), video: dt("مقطع مرئي"), audio: dt("رسالة صوتية"), document: dt("ملف"), sticker: dt("ملصق"),
  };
  const base = names[media.kind] ?? media.kind;
  return media.filename ? `${base}  ${media.filename}` : base;
}

/** "٤ ساعات" left in the window, or how long ago it closed. */
function windowText(window: ReplyWindow): string {
  if (!window.lastInboundAt) return dt("لم يُرسل المتبرع أي رسالة بعد  الردّ يتطلّب قالبًا معتمدًا.");
  if (!window.open) return dt("انتهت نافذة الردّ الحر (آخر رسالة من المتبرع {0})  استخدم قالبًا معتمدًا.", [fmtFull(window.lastInboundAt)]);
  const hours = Math.floor(window.remainingMs / 3_600_000);
  const minutes = Math.floor((window.remainingMs % 3_600_000) / 60_000);
  return hours > 0 ? dt("يمكن الردّ بنص حر خلال {0} ساعة و{1} دقيقة.", [hours, minutes]) : dt("يمكن الردّ بنص حر خلال {0} دقيقة.", [minutes]);
}

function messageStatus(status: string | null): string {
  switch (status) {
    case "SENT": return dt("أُرسلت");
    case "DELIVERED": return dt("وصلت");
    case "READ": return dt("قُرئت");
    case "FAILED": return dt("فشلت");
    case "RENDERED": return dt("جاهزة");
    default: return status ?? "";
  }
}

function invalidateRequest(request: { current: number }) {
  request.current++;
}

export function WhatsappInbox() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [needsReply, setNeedsReply] = useState(0);
  const [filter, setFilter] = useState("all");
  const [senderId, setSenderId] = useState<string>("");
  const [query, setQuery] = useState(initialQuery);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [replyWindow, setReplyWindow] = useState<ReplyWindow | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draft = activeId ? drafts[activeId] ?? "" : "";
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [smartOpen, setSmartOpen] = useState(false);
  const [smartInitialMode, setSmartInitialMode] = useState<"FREEFORM" | "UTILITY" | "MARKETING" | undefined>(undefined);
  const senderSelectionReady = useRef(false);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<string | null>(null);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const replyInFlight = useRef(false);
  const followBottom = useRef(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const selectConversation = useCallback((id: string | null) => {
    if (activeRef.current === id) return;
    activeRef.current = id;
    detailRequest.current++;
    followBottom.current = true;
    setActiveId(id);
    setLoadingDetail(Boolean(id));
    setDetail(null);
    setReplyWindow(null);
    setNotice(null);
    setDetailError(null);
    setLoadingOlder(false);
    setSmartOpen(false);
  }, []);

  const loadList = useCallback(async (silent = false) => {
    const request = ++listRequest.current;
    if (!silent) setLoadingList(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ filter });
      if (senderId) params.set("senderId", senderId);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/dashboard/communication/inbox?${params}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const data = await res.json();
      if (request !== listRequest.current) return;
      if (!res.ok || !data.ok) throw new Error(data.error === "INBOX_UNAVAILABLE" ? dt("تعذّر تحميل صندوق واتساب") : data.error ?? "load failed");
      const nextConversations = data.conversations ?? [];
      const nextSenders = data.senders ?? [];
      setConversations(nextConversations);
      setSenders(nextSenders);
      setNeedsReply(data.needsReply ?? 0);

      if (!senderSelectionReady.current && nextSenders.length > 0) {
        senderSelectionReady.current = true;
        const remembered = typeof window !== "undefined" ? window.localStorage.getItem("communication:whatsapp:senderId") : null;
        const preferred = remembered && nextSenders.some((sender: Sender) => sender.id === remembered)
          ? remembered
          : (nextSenders.length === 1 ? nextSenders[0].id : "");
        if (preferred !== senderId) {
          setSenderId(preferred);
          return;
        }
      }

      if (nextConversations.length === 0) {
        selectConversation(null);
      } else {
        if (!nextConversations.some((conversation: Conversation) => conversation.id === activeRef.current)) selectConversation(nextConversations[0].id);
      }
    } catch (error) {
      if (request !== listRequest.current) return;
      setListError((error as Error).message || dt("تعذّر تحميل صندوق واتساب"));
    } finally {
      if (request === listRequest.current) setLoadingList(false);
    }
  }, [filter, senderId, query, selectConversation]);

  useEffect(() => { void loadList(); return () => invalidateRequest(listRequest); }, [loadList]);

  // Keep an operational inbox fresh without forcing the team to click «تحديث».
  // Silent polling preserves the current list on transient errors instead of
  // turning a backend/network failure into a false empty state.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadList(true);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [loadList]);

  const loadDetail = useCallback(async (id: string, silent = false) => {
    if (activeRef.current !== id) return;
    const request = ++detailRequest.current;
    if (!silent) setLoadingDetail(true);
    if (!silent) setNotice(null);
    setDetailError(null);
    try {
      const res = await fetch(`/api/dashboard/communication/inbox/${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
      const data = await res.json();
      if (request !== detailRequest.current || activeRef.current !== id) return;
      if (!res.ok || !data.ok) throw new Error(data.error === "INBOX_UNAVAILABLE" ? dt("تعذّر تحميل المحادثة") : data.error ?? "load failed");
      setDetail(previous => previous && silent ? {
        ...data.conversation,
        timeline: mergeInboxTimeline(previous.timeline, data.conversation.timeline),
        hasMore: previous.hasMore,
        oldestAt: previous.oldestAt,
      } : data.conversation);
      setReplyWindow(data.replyWindow);
    } catch (error) {
      if (request !== detailRequest.current || activeRef.current !== id) return;
      setDetailError((error as Error).message || dt("تعذّر تحميل المحادثة"));
    } finally {
      if (request === detailRequest.current) setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { if (activeId) void loadDetail(activeId); return () => invalidateRequest(detailRequest); }, [activeId, loadDetail]);

  useEffect(() => {
    if (!activeId) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadDetail(activeId, true);
    }, 15_000);
    return () => window.clearInterval(id);
  }, [activeId, loadDetail]);

  /* Newest message in view when a conversation opens  the reason anyone opened it. */
  useEffect(() => {
    const node = timelineRef.current;
    if (node && followBottom.current) node.scrollTop = node.scrollHeight;
  }, [detail]);

  const act = useCallback(async (action: "handled" | "followup" | "link") => {
    if (!activeId) return;
    const requestedId = activeId;
    try {
    const res = await fetch(`/api/dashboard/communication/inbox/${encodeURIComponent(activeId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (activeRef.current !== requestedId) return;
    if (res.ok) {
      setNotice({ tone: "ok", text: action === "handled" ? dt("تم وسمها كمُعالَجة.") : action === "followup" ? dt("سُجّل طلب المتابعة.") : dt("سُجّل طلب الربط بمتبرع.") });
      void loadList();
    } else {
      setNotice({ tone: "error", text: dt("تعذّر تنفيذ الإجراء.") });
    }
    } catch {
      if (activeRef.current === requestedId) setNotice({ tone: "error", text: dt("تعذّر تنفيذ الإجراء.") });
    }
  }, [activeId, loadList]);

  const sendReply = useCallback(async () => {
    if (!activeId || !draft.trim() || replyInFlight.current) return;
    const conversationId = activeId;
    const submittedDraft = draft;
    replyInFlight.current = true;
    setSending(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/dashboard/communication/inbox/${encodeURIComponent(activeId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reply", body: draft.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== true) throw new Error("Unconfirmed send response");
      if (res.ok && data.ok) setDrafts(previous => previous[conversationId] === submittedDraft ? { ...previous, [conversationId]: "" } : previous);
      if (activeRef.current !== conversationId) return;
      if (!res.ok || !data.ok) {
        /* The window closing between load and send is the one failure an operator will actually
           hit, so it is named rather than reported as a generic error. */
        setNotice({
          tone: "error",
          text: data.error === "REPLY_WINDOW_CLOSED"
            ? dt("انتهت نافذة الردّ الحر قبل الإرسال  استخدم قالبًا معتمدًا.")
            : data.error === "ACCEPTED_UNRECORDED"
              ? dt("قبل المزوّد الرسالة لكن تعذّر تحديث سجلها؛ لا تُعد إرسالها")
            : dt("تعذّر الإرسال: {0}", [data.error ?? dt("خطأ غير معروف")]),
        });
        return;
      }
      followBottom.current = true;
      setNotice({ tone: "ok", text: dt("أُرسل الردّ.") });
      await loadDetail(conversationId, true);
      void loadList(true);
    } catch {
      if (activeRef.current === conversationId) setNotice({ tone: "error", text: dt("نتيجة المزوّد غير مؤكدة؛ راجعها قبل السماح بمحاولة جديدة") });
      await loadDetail(conversationId, true);
    } finally {
      replyInFlight.current = false;
      setSending(false);
    }
  }, [activeId, draft, loadDetail, loadList]);

  const senderOptions = useMemo(
    () => [{ value: "", label: dt("كل الأرقام") }, ...senders.map((s) => ({ value: s.id, label: s.phone ? `${s.name} · ${s.phone}` : s.name }))],
    [senders],
  );

  return (
    <div dir={dashDir()}>
      <PageHeader
        eyebrow={dt("التواصل")}
        title={dt("صندوق واتساب")}
        description={dt("ردود المتبرعين على رسائل واتساب، مجمّعة لكل رقم عمل على حدة.")}
        icon={MessageCircle}
        actions={
          <button
            type="button"
            onClick={() => { void loadList(); if (activeRef.current) void loadDetail(activeRef.current, true); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={cn("w-4 h-4", loadingList && "animate-spin")} />
            {dt("تحديث")}</button>
        }
      />

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          value={filter}
          onChange={(v) => setFilter(String(v))}
          options={FILTERS}
        />
        <select
          value={senderId}
          onChange={(e) => {
            const value = e.target.value;
            setSenderId(value);
            if (typeof window !== "undefined") {
              if (value) window.localStorage.setItem("communication:whatsapp:senderId", value);
              else window.localStorage.removeItem("communication:whatsapp:senderId");
            }
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
        >
          {senderOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={dt("رقم، اسم، أو نصّ رسالة")}
            className="w-64 rounded-lg border border-slate-200 bg-white py-1.5 ps-8 pe-3 text-sm text-slate-700 placeholder:text-slate-400"
          />
        </div>
        <span className={cn(
          "rounded-full border px-2.5 py-1 text-xs font-medium",
          needsReply > 0 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700",
        )}>
          {needsReply > 0 ? dt("{0} محادثة بانتظار ردّ", [needsReply]) : dt("لا شيء بانتظار ردّ")}
        </span>
        </div>
      </div>

      <div className="grid min-h-[68vh] gap-4 xl:grid-cols-[minmax(20rem,23rem)_minmax(0,1fr)]">
        {/* ── Conversation list ─────────────────────────────────── */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {listError && conversations.length > 0 && (
            <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
              {dt("تعذّر تحديث القائمة الآن؛ المعروض هو آخر بيانات ناجحة.")}</div>
          )}
          {loadingList ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : listError && conversations.length === 0 ? (
            <div className="p-5">
              <EmptyState
                variant="inline"
                title={dt("تعذّر تحميل المحادثات")}
                description={listError}
              />
              <button
                type="button"
                onClick={() => void loadList()}
                className="mx-auto mt-3 block rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {dt("إعادة المحاولة")}</button>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-5">
              <EmptyState
                variant="inline"
                title={dt("لا توجد محادثات")}
                description={filter === "needsReply" ? dt("لا توجد محادثات بانتظار الرد حاليًا.") : dt("لم تصل أي محادثات مطابقة لهذا الفلتر.")}
              />
              {filter !== "all" && (
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className="mx-auto mt-3 block rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {dt("عرض كل المحادثات")}</button>
              )}
            </div>
          ) : (
            <ul className="max-h-[72vh] divide-y divide-slate-100 overflow-y-auto">
              {conversations.map((c) => {
                const at = fmtDateTime(c.lastMessageAt);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => selectConversation(c.id)}
                      className={cn(
                        "relative w-full px-3 py-3.5 text-start transition-colors hover:bg-slate-50",
                        activeId === c.id && "bg-emerald-50/70",
                      )}
                    >
                      {activeId === c.id && <span className="absolute inset-y-2 start-0 w-1 rounded-e-full bg-emerald-500" />}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {c.donor?.name || c.phone}
                        </span>
                        {c.needsReply && (
                          <span className="shrink-0 rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            {dt("بانتظار ردّ")}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 truncate">{c.lastInboundText || "—"}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        {at && <span>{at.date} · {at.time}</span>}
                        {c.sender?.phone && <span className="truncate">{dtx("عبر {0}", [c.sender.phone])}</span>}
                        {c.unresolved && (
                          <span className="inline-flex items-center gap-0.5 text-slate-400">
                            <UserX className="w-3 h-3" /> {dt(" غير مرتبطة")}</span>
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
        <div className="flex h-[76vh] min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {!activeId ? (
            <EmptyState variant="inline" title={dt("اختر محادثة")} description={dt("ستظهر الرسائل وملف المتبرع هنا.")} />
          ) : loadingDetail && !detail ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : detailError && !detail ? (
            <div className="p-5">
              <EmptyState variant="inline" title={dt("تعذّر تحميل المحادثة")} description={detailError} />
              <button
                type="button"
                onClick={() => activeId && void loadDetail(activeId)}
                className="mx-auto mt-3 block rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {dt("إعادة المحاولة")}</button>
            </div>
          ) : !detail ? (
            <EmptyState variant="inline" title={dt("تعذّر تحميل المحادثة")} />
          ) : (
            <>
              {detailError && (
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-medium text-amber-800">
                  {dt("تعذّر تحديث المحادثة الآن؛ المعروض هو آخر بيانات ناجحة.")}</div>
              )}
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {detail.donor?.name || detail.phone}
                    </p>
                    <p className="text-xs text-slate-500">
                      {detail.phone}
                      {detail.sender?.phone ? dt(" · عبر {0}", [detail.sender.phone]) : ""}
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
                        <UserRound className="w-3.5 h-3.5" /> {dt(" في قائمة المتبرعين")}</Link>
                    )}
                    <button type="button" onClick={() => void act("handled")} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <Check className="w-3.5 h-3.5" /> {dt(" مُعالَجة")}</button>
                    <button type="button" onClick={() => void act("followup")} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <Flag className="w-3.5 h-3.5" /> {dt(" متابعة")}</button>
                    {detail.unresolved && (
                      <button type="button" onClick={() => void act("link")} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        <Link2 className="w-3.5 h-3.5" /> {dt(" ربط بمتبرع")}</button>
                    )}
                  </div>
                </div>
                {detail.donor && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    {detail.donor.totalDonations != null && <span>{dtx("{0} تبرعًا", [detail.donor.totalDonations])}</span>}
                    {detail.donor.lastDonationAt && <span>{dtx("آخر تبرع {0}", [fmtFull(detail.donor.lastDonationAt)])}</span>}
                    {detail.donor.locale && <span>{dtx("اللغة {0}", [detail.donor.locale])}</span>}
                    {detail.donor.doNotContact && (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-700">
                        {dt("ممنوع التواصل")}</span>
                    )}
                  </div>
                )}
              </div>

              <div ref={timelineRef} onScroll={() => { const node = timelineRef.current; if (node) followBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; }} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-slate-50/80 to-white px-4 py-4">
                {detail.hasMore && (
                  <button
                    type="button"
                    disabled={loadingOlder}
                    onClick={() => {
                      if (!detail.oldestAt || !activeId) return;
                      const requestedId = activeId;
                      const node = timelineRef.current;
                      const oldHeight = node?.scrollHeight ?? 0;
                      const oldTop = node?.scrollTop ?? 0;
                      followBottom.current = false;
                      setLoadingOlder(true);
                      void (async () => {
                        try {
                        const res = await fetch(`/api/dashboard/communication/inbox/${encodeURIComponent(requestedId)}?before=${encodeURIComponent(detail.oldestAt!)}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
                        const data = await res.json();
                        if (activeRef.current !== requestedId) return;
                        if (!res.ok || !data.ok) throw new Error("load failed");
                          /* Older page prepended, so the reader keeps their place in the thread. */
                          setDetail(previous => previous ? { ...previous, timeline: mergeInboxTimeline(data.conversation.timeline, previous.timeline), oldestAt: data.conversation.oldestAt, hasMore: data.conversation.hasMore } : previous);
                          requestAnimationFrame(() => { if (node && activeRef.current === requestedId) node.scrollTop = oldTop + node.scrollHeight - oldHeight; });
                        } catch {
                          if (activeRef.current === requestedId) setDetailError(dt("تعذّر تحميل المحادثة"));
                        } finally {
                          if (activeRef.current === requestedId) setLoadingOlder(false);
                        }
                      })();
                    }}
                    className="mx-auto block rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {dt("تحميل رسائل أقدم")}</button>
                )}
                {detail.timeline.map((item) => {
                  if (item.kind === "status") {
                    return (
                      <p key={item.id} className="text-center text-[11px] text-slate-400">
                        {messageStatus(item.status)} · {fmtFull(item.at)}
                      </p>
                    );
                  }
                  const inbound = item.kind === "inbound";
                  const MediaIcon = item.media ? MEDIA_ICONS[item.media.kind] ?? FileText : null;
                  return (
                    <div key={item.id} className={cn("flex", inbound ? "justify-start" : "justify-end")}>
                      <div
                        className={cn(
                          "max-w-[78%] rounded-2xl px-3 py-2.5 text-sm shadow-sm",
                          inbound ? "border border-slate-200 bg-white text-slate-800" : "border border-emerald-200 bg-emerald-50 text-slate-900",
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

                        {!inbound && item.whatsappPreview?.header?.type === "image" && item.whatsappPreview.header.mediaUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.whatsappPreview.header.mediaUrl}
                            alt={item.whatsappPreview.header.text ?? "WhatsApp header"}
                            className="mb-2 max-h-64 w-full rounded-xl object-cover"
                          />
                        )}
                        {!inbound && item.whatsappPreview?.header?.type === "video" && item.whatsappPreview.header.mediaUrl && (
                          <video controls preload="metadata" className="mb-2 max-h-64 w-full rounded-xl">
                            <source src={item.whatsappPreview.header.mediaUrl} />
                          </video>
                        )}
                        {!inbound && item.whatsappPreview?.header?.type === "document" && (
                          <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white/70 p-2 text-xs text-slate-600">
                            <FileText className="h-4 w-4" />
                            <span>{item.whatsappPreview.header.fileName || dt("ملف مرفق")}</span>
                          </div>
                        )}
                        {!inbound && item.whatsappPreview?.header?.type === "location" && (
                          <div className="mb-2 flex items-start gap-2 rounded-lg border border-slate-200 bg-white/70 p-2 text-xs text-slate-600">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                              {item.whatsappPreview.header.name || item.whatsappPreview.header.address || dt("موقع")}
                              {item.whatsappPreview.header.latitude != null && item.whatsappPreview.header.longitude != null
                                ? ` · ${item.whatsappPreview.header.latitude}, ${item.whatsappPreview.header.longitude}`
                                : ""}
                            </span>
                          </div>
                        )}
                        {!inbound && item.whatsappPreview?.header?.type === "text" && item.whatsappPreview.header.text && (
                          <p className="mb-1.5 whitespace-pre-wrap break-words font-semibold">
                            {item.whatsappPreview.header.text}
                          </p>
                        )}

                        {item.text && <p className="whitespace-pre-wrap break-words">{item.text}</p>}
                        {!item.text && !item.media && !item.whatsappPreview && <p className="text-slate-400">—</p>}

                        {!inbound && item.whatsappPreview?.footerText && (
                          <p className="mt-2 whitespace-pre-wrap break-words text-[11px] text-slate-500">
                            {item.whatsappPreview.footerText}
                          </p>
                        )}
                        {!inbound && item.whatsappPreview?.buttons?.length ? (
                          <div className="mt-2 space-y-1 border-t border-emerald-200/70 pt-2">
                            {item.whatsappPreview.buttons.map((button) => (
                              <div
                                key={button.index}
                                className="flex items-center justify-center gap-1.5 rounded-lg bg-white/80 px-2 py-1.5 text-xs font-semibold text-emerald-700"
                              >
                                <Link2 className="h-3.5 w-3.5" />
                                <span>{button.text || button.url || button.phoneNumber || dt("إجراء")}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <p className="mt-1 text-[10px] text-slate-400">
                          {fmtFull(item.at)}
                          {!inbound && item.status ? ` · ${messageStatus(item.status)}` : ""}
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
                {detail.donor?.doNotContact ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                    {dt("المتبرع مفعّل عليه «عدم التواصل». الإرسال متوقف حتى تُعدّل حالة التواصل.")}</div>
                ) : replyWindow?.open ? (
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => { const value = e.target.value; if (activeId) setDrafts(previous => ({ ...previous, [activeId]: value })); }}
                      disabled={sending}
                      rows={2}
                      placeholder={dt("اكتب ردًّا…")}
                      className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => void sendReply()}
                      disabled={sending || !draft.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {dt("إرسال")}</button>
                  </div>
                ) : detail.donor?.userId ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div>
                      <p className="text-xs font-semibold text-amber-800">{dt("نافذة الرد الحر مغلقة")}</p>
                      <p className="mt-1 text-[11px] text-amber-700">{dt("يمكن إرسال رسالة خدمة عبر Direct Send أو اختيار قالب Marketing معتمد.")}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSmartInitialMode("MARKETING");
                          setSmartOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        <MessageCircle className="h-4 w-4" />
                        {dt("إرسال قالب تحية")}</button>
                      <button
                        type="button"
                        onClick={() => {
                          setSmartInitialMode("UTILITY");
                          setSmartOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-semibold text-white hover:bg-[#20bd5a]"
                      >
                        <Send className="h-4 w-4" />
                        {dt("خيارات الإرسال")}</button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    {dt("اربط المحادثة بمتبرع أولًا لاستخدام Direct Send أو القوالب التسويقية.")}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {detail?.donor?.userId && (
        <SmartWhatsappDialog
          open={smartOpen}
          onOpenChange={setSmartOpen}
          userId={detail.donor.userId}
          userName={detail.donor.name}
          phone={detail.phone}
          initialMode={smartInitialMode}
        />
      )}
    </div>
  );
}
