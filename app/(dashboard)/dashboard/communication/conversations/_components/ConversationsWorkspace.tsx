"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dt } from "@/lib/dashboard/i18n";
import { InboxAttachments, type InboxAttachment } from "../../inbox/_components/InboxAttachments";
import { InboxMedia } from "../../inbox/_components/InboxMedia";

type Lang = "ar" | "tr" | "fr" | "en";
type View = "all" | "mine" | "unread" | "done";
type Conversation = {
  id: string; phone: string; name: string | null; language: Lang; assigneeId: string | null; assigneeName: string | null;
  status: "OPEN" | "DONE"; unreadCount: number; lastMessageAt: string | null; lastPreview: string; lastDirection: "in" | "out" | null; windowExpiresAt: string | null;
};
type Counts = Record<Lang | "all" | "mine", number>;
type TimelineItem = { id: string; kind: "inbound" | "outbound" | "status"; at: string | null; text: string | null; status: string | null; media?: { kind: string; mediaId: string | null; mimeType: string | null; filename: string | null; caption: string | null } | null };
type Detail = { id: string; phone: string; timeline: TimelineItem[]; donor: { name: string | null; doNotContact: boolean } | null; hasMore: boolean; oldestAt: string | null };
type ReplyWindow = { open: boolean; remainingMs: number };

const LANGS: Array<{ key: Lang; label: string; flag: string }> = [
  { key: "ar", label: "العربية", flag: "🇸🇦" }, { key: "tr", label: "التركية", flag: "🇹🇷" },
  { key: "fr", label: "الفرنسية", flag: "🇫🇷" }, { key: "en", label: "الإنجليزية", flag: "🇬🇧" },
];
const API = "/api/dashboard/communication/inbox";
const initials = (c: Conversation) => (c.name || c.phone).replace(/^\+/, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
function shortTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  if (sameDay(d, now)) return d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return dt("أمس");
  return d.toLocaleDateString("ar", { day: "numeric", month: "short" });
}
function Ticks({ status }: { status: string | null }) {
  const s = (status || "").toUpperCase();
  if (s === "FAILED" || s === "BOUNCED") return <span className="text-red-600" title={dt("فشل الإرسال")}>⚠</span>;
  if (s === "READ" || s === "REPLIED") return <span className="text-sky-500" title={dt("قُرئت")}>✓✓</span>;
  if (s === "DELIVERED") return <span className="text-slate-400" title={dt("وصلت")}>✓✓</span>;
  return <span className="text-slate-400" title={dt("أُرسلت")}>✓</span>;
}

export function ConversationsWorkspace({ currentUserId }: { currentUserId: string | null }) {
  const [lang, setLang] = useState<Lang | "all">("all");
  const [view, setView] = useState<View>("all");
  const [q, setQ] = useState(""), [query, setQuery] = useState("");
  const [items, setItems] = useState<Conversation[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [listError, setListError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [replyWindow, setReplyWindow] = useState<ReplyWindow | null>(null);
  const [draft, setDraft] = useState(""), [attachment, setAttachment] = useState<InboxAttachment | null>(null);
  const [recording, setRecording] = useState(false), [sending, setSending] = useState(false), [notice, setNotice] = useState("");
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  // The open conversation stays on screen even when it leaves the current list (e.g. marked done).
  const [pinned, setPinned] = useState<Conversation | null>(null);
  const listed = useMemo(() => items.find((c) => c.id === activeId) ?? null, [items, activeId]);
  useEffect(() => { if (listed) setPinned(listed); else if (!activeId) setPinned(null); }, [listed, activeId]);
  const active = listed ?? (pinned && pinned.id === activeId ? pinned : null);

  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => { fetch(`${API}/conversations/staff`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { staff: [] })).then((d: { staff?: Array<{ id: string; name: string }> }) => setStaff(d.staff ?? [])).catch(() => undefined); }, []);

  const loadList = useCallback(async () => {
    const p = new URLSearchParams({ language: lang, view, ...(query ? { q: query } : {}) });
    try {
      const r = await fetch(`${API}/conversations?${p}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { conversations: Conversation[]; counts: Counts };
      setItems(d.conversations); setCounts(d.counts); setListError("");
    } catch { setListError(dt("تعذّر تحميل المحادثات")); }
  }, [lang, view, query]);
  useEffect(() => { void loadList(); const t = setInterval(() => void loadList(), 10_000); return () => clearInterval(t); }, [loadList]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const r = await fetch(`${API}/${encodeURIComponent(id)}?limit=60`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (!r.ok) return;
      const d = (await r.json()) as { conversation: Detail; replyWindow: ReplyWindow };
      setDetail(d.conversation); setReplyWindow(d.replyWindow);
    } catch { /* keep the last good view */ }
  }, []);
  useEffect(() => {
    if (!activeId) return;
    setDetail(null); setReplyWindow(null); setDraft(""); setAttachment(null); setNotice("");
    void loadDetail(activeId);
    void fetch(`${API}/conversations`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: activeId, read: true }) }).then(() => { window.dispatchEvent(new Event("whatsapp-inbox-updated")); return loadList(); }).catch(() => undefined);
    const t = setInterval(() => void loadDetail(activeId), 5_000);
    return () => clearInterval(t);
  }, [activeId, loadDetail, loadList]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [detail?.timeline.length]);

  const patch = async (body: Record<string, unknown>) => {
    if (!activeId) return;
    await fetch(`${API}/conversations`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: activeId, ...body }) }).catch(() => undefined);
    // Reflect the change at once on the pinned copy (it may no longer be in the filtered list).
    setPinned((p) => (p && p.id === activeId ? {
      ...p,
      ...(typeof body.language === "string" ? { language: body.language as Lang } : {}),
      ...(typeof body.status === "string" ? { status: body.status as "OPEN" | "DONE" } : {}),
      ...(body.unassign ? { assigneeId: null, assigneeName: null } : {}),
      ...(body.assignToMe ? { assigneeId: currentUserId } : {}),
      ...(typeof body.assigneeId === "string" ? { assigneeId: body.assigneeId, assigneeName: (body.assigneeName as string | null) ?? null } : {}),
    } : p));
    await loadList();
  };

  const send = async () => {
    if (!activeId || sending || recording || (!draft.trim() && !attachment)) return;
    setSending(true); setNotice("");
    try {
      let res: Response;
      if (attachment) {
        const form = new FormData(); const audio = attachment.voice || attachment.file.type.startsWith("audio/");
        form.set("file", attachment.file); form.set("voice", String(attachment.voice)); form.set("body", audio ? "" : draft.trim());
        res = await fetch(`${API}/${encodeURIComponent(activeId)}/media`, { method: "POST", body: form });
      } else {
        res = await fetch(`${API}/${encodeURIComponent(activeId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reply", body: draft.trim() }) });
      }
      if (res.ok) { setDraft(""); setAttachment(null); await loadDetail(activeId); await loadList(); }
      else {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice(e.error === "REPLY_WINDOW_CLOSED" ? dt("انتهت نافذة الـ24 ساعة: لا يمكن الرد إلا بقالب معتمد.") : dt("تعذّر الإرسال") + (e.error ? ` (${e.error})` : ""));
      }
    } finally { setSending(false); }
  };

  const windowLabel = replyWindow?.open ? dt("نافذة الرد مفتوحة: متبقٍّ {0}", [`${Math.floor(replyWindow.remainingMs / 3_600_000)}:${String(Math.floor((replyWindow.remainingMs % 3_600_000) / 60_000)).padStart(2, "0")}`]) : dt("نافذة الرد مغلقة");

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[520px] overflow-hidden rounded-xl border bg-white" dir="rtl">
      {/* ── conversation list ── */}
      <aside className={`${activeId ? "hidden md:flex" : "flex"} w-full flex-col border-l md:w-[380px] md:min-w-[380px]`}>
        <div className="space-y-2 border-b p-3">
          <div className="flex gap-1 overflow-x-auto text-xs">
            <button type="button" onClick={() => setLang("all")} className={`whitespace-nowrap rounded-full px-3 py-1 ${lang === "all" ? "bg-emerald-700 text-white" : "bg-slate-100"}`}>{dt("الكل")}{counts?.all ? ` · ${counts.all}` : ""}</button>
            {LANGS.map((l) => (
              <button key={l.key} type="button" onClick={() => setLang(l.key)} className={`whitespace-nowrap rounded-full px-3 py-1 ${lang === l.key ? "bg-emerald-700 text-white" : "bg-slate-100"}`}>
                {l.flag} {dt(l.label)}{counts?.[l.key] ? <b className="ms-1 rounded-full bg-emerald-500 px-1.5 text-white">{counts[l.key]}</b> : null}
              </button>))}
          </div>
          <div className="flex gap-1 text-xs">
            {(["all", "mine", "unread", "done"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} className={`rounded px-2 py-1 ${view === v ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {v === "all" ? dt("المفتوحة") : v === "mine" ? dt("المعيّنة لي") : v === "unread" ? dt("غير المقروءة") : dt("المنتهية")}{v === "mine" && counts?.mine ? ` · ${counts.mine}` : ""}
              </button>))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={dt("بحث بالاسم أو الرقم أو نص الرسالة")} className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm outline-none" />
        </div>
        <ul className="flex-1 overflow-y-auto">
          {listError && <li className="p-4 text-sm text-red-700">{listError}</li>}
          {!listError && items.length === 0 && <li className="p-6 text-center text-sm text-slate-500">{dt("لا محادثات هنا")}</li>}
          {items.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setActiveId(c.id)} className={`flex w-full items-center gap-3 border-b px-3 py-2.5 text-start hover:bg-slate-50 ${c.id === activeId ? "bg-emerald-50" : ""}`}>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">{initials(c)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <b className="truncate text-sm" dir="auto">{c.name || c.phone}</b>
                    <span className={`shrink-0 text-[11px] ${c.unreadCount ? "font-bold text-emerald-600" : "text-slate-400"}`}>{shortTime(c.lastMessageAt)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-500" dir="auto">{c.lastDirection === "out" ? <><Ticks status="SENT" /> </> : null}{c.lastPreview || "—"}</span>
                    {c.unreadCount ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-emerald-500 px-1 text-[11px] font-bold text-white">{c.unreadCount}</span> : null}
                  </span>
                  {c.assigneeName ? <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 text-[10px] text-slate-600">👤 {c.assigneeName}</span> : null}
                </span>
              </button>
            </li>))}
        </ul>
      </aside>

      {/* ── conversation ── */}
      <section className={`${activeId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-[#efeae2]`}>
        {!active ? (
          <div className="m-auto text-center text-sm text-slate-500"><p className="text-base font-bold text-slate-700">{dt("اختر محادثة")}</p><p>{dt("المحادثات مصنّفة حسب اللغة، ويمكن تعيين كل محادثة لموظف.")}</p></div>
        ) : (<>
          <header className="flex flex-wrap items-center gap-2 border-b bg-white px-3 py-2">
            <button type="button" onClick={() => setActiveId(null)} className="rounded px-2 py-1 text-lg md:hidden" aria-label={dt("رجوع")}>→</button>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">{initials(active)}</span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-sm" dir="auto">{active.name || active.phone}</b>
              <span className="text-xs text-slate-500" dir="ltr">{active.phone}</span>
              {detail?.donor?.doNotContact ? <span className="ms-2 rounded bg-red-100 px-1.5 text-[10px] text-red-700">{dt("طلب عدم التواصل")}</span> : null}
            </span>
            <span className={`rounded-full px-2 py-1 text-[11px] ${replyWindow?.open ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>⏱ {windowLabel}</span>
            <select value={active.language} onChange={(e) => void patch({ language: e.target.value })} className="rounded border px-1 py-1 text-xs" aria-label={dt("اللغة")}>
              {LANGS.map((l) => <option key={l.key} value={l.key}>{l.flag} {dt(l.label)}</option>)}
            </select>
            <select value={active.assigneeId ?? ""} onChange={(e) => { const v = e.target.value; if (!v) void patch({ unassign: true }); else if (v === currentUserId) void patch({ assignToMe: true }); else void patch({ assigneeId: v, assigneeName: staff.find((s) => s.id === v)?.name ?? null }); }} className="max-w-[150px] rounded border px-1 py-1 text-xs" aria-label={dt("المسؤول")}>
              <option value="">{dt("بلا مسؤول")}</option>
              {currentUserId && !staff.some((s) => s.id === currentUserId) ? <option value={currentUserId}>{dt("أنا")}</option> : null}
              {staff.map((s) => <option key={s.id} value={s.id}>{s.id === currentUserId ? `${s.name} (${dt("أنا")})` : s.name}</option>)}
            </select>
            <button type="button" onClick={() => void patch({ status: active.status === "DONE" ? "OPEN" : "DONE" })} className={`rounded px-2 py-1 text-xs font-bold ${active.status === "DONE" ? "bg-slate-200" : "bg-emerald-700 text-white"}`}>{active.status === "DONE" ? dt("إعادة فتح") : dt("تم ✓")}</button>
          </header>

          <div className="flex-1 space-y-1 overflow-y-auto px-4 py-3">
            {!detail ? <p className="text-center text-sm text-slate-500">{dt("جارٍ التحميل…")}</p> : (() => {
              // Status lines (SENT/DELIVERED/READ) that follow an outgoing message become its ticks.
              const rank: Record<string, number> = { SENT: 1, DELIVERED: 2, READ: 3, REPLIED: 3 };
              const best = new Map<string, string>(); let owner: string | null = null;
              for (const it of detail.timeline) {
                if (it.kind === "outbound") { owner = it.id; best.set(it.id, (it.status || "SENT").toUpperCase()); }
                else if (it.kind === "inbound") owner = null;
                else if (owner && it.status) { const st = it.status.toUpperCase(), cur = best.get(owner) || "SENT";
                  if (/FAIL|BOUNCE/.test(st)) best.set(owner, "FAILED"); else if (cur !== "FAILED" && (rank[st] ?? 0) > (rank[cur] ?? 0)) best.set(owner, st); }
              }
              return detail.timeline.map((m, i) => {
              const prev = detail.timeline[i - 1]; const d = m.at ? new Date(m.at) : null;
              const dayBreak = d && (!prev?.at || !sameDay(new Date(prev.at), d));
              return (
                <div key={m.id}>
                  {dayBreak ? <div className="my-2 text-center"><span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] text-slate-600 shadow-sm">{d!.toLocaleDateString("ar", { weekday: "long", day: "numeric", month: "long" })}</span></div> : null}
                  {m.kind === "status" ? (
                    /FAIL|BOUNCE|ERROR/i.test(m.status || "") ? <p className="text-center text-[11px] text-red-600">⚠ {m.text || m.status}</p> : null
                  ) : (
                    <div className={`flex ${m.kind === "inbound" ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm shadow-sm ${m.kind === "inbound" ? "rounded-tr-none bg-white" : "rounded-tl-none bg-[#d9fdd3]"}`}>
                        {m.media ? <InboxMedia conversationId={active.id} itemId={m.id} media={m.media} /> : null}
                        {m.text ? <p className="whitespace-pre-wrap break-words" dir="auto">{m.text}</p> : null}
                        <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                          {d ? d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }) : ""}{m.kind === "outbound" ? <Ticks status={best.get(m.id) ?? m.status} /> : null}
                        </span>
                      </div>
                    </div>)}
                </div>);
              });
            })()}
            <div ref={bottomRef} />
          </div>

          <footer className="border-t bg-[#f0f2f5] p-2">
            {notice ? <p className="mb-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{notice}</p> : null}
            {replyWindow && !replyWindow.open ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">{dt("مرّت أكثر من 24 ساعة على آخر رسالة من المتبرع، فقواعد واتساب لا تسمح بالرد الحر. يمكن مراسلته بقالب معتمد من صفحة الحملات.")}</p>
            ) : detail?.donor?.doNotContact ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-700">{dt("هذا المتبرع طلب عدم التواصل.")}</p>
            ) : (
              <div className="flex items-end gap-2">
                <InboxAttachments attachment={attachment ?? undefined} onChange={setAttachment} disabled={sending} onError={(m: string) => setNotice(m)} onRecordingChange={setRecording} />
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  rows={1} placeholder={dt("اكتب رسالة")} dir="auto" className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg bg-white px-3 py-2 text-sm outline-none" />
                <button type="button" onClick={() => void send()} disabled={sending || recording || (!draft.trim() && !attachment)} className="grid h-10 w-10 place-items-center rounded-full bg-emerald-600 text-white disabled:opacity-40" aria-label={dt("إرسال")}>➤</button>
              </div>)}
          </footer>
        </>)}
      </section>
    </div>
  );
}
