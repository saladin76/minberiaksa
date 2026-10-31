"use client";
import { useRef, useState } from "react";
import { Bot, Send } from "lucide-react";
import { dt } from "@/lib/dashboard/i18n";
import { availableSearchActions, type SearchChatTurn, type SearchChatReply } from "@/lib/marketing/google-search/conversation-contracts";

const labels: Record<SearchChatReply["recommendation"], string> = { none: "", validate: "فحص الخطة داخل Google", create: "إنشاء الحملات موقوفة", enable: "مراجعة تفعيل الحملات", pause: "إيقاف حملات الخطة", budget: "مراجعة تعديل الميزانية", replan: "مراجعة تنقيح المسودة" };
export function GoogleSearchConversation({ turns, prompt, summary, version, status, disabled, sending, onSend, onAction }: {
  turns: SearchChatTurn[]; prompt: string; summary: string; version: number; status: string; disabled: boolean; sending: boolean;
  onSend: (message: string, requestId: string) => Promise<boolean>;
  onAction: (action: SearchChatReply["recommendation"], suggestedBudget: number | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const attempt = useRef<{ message: string; id: string } | null>(null);
  const latest = turns.at(-1), recommendation = latest?.assistant.recommendation;
  const actionable = latest?.planVersion === version && recommendation && recommendation !== "none" && availableSearchActions(status).includes(recommendation);
  const submit = async () => {
    const message = draft.trim(); if (!message || disabled) return;
    if (attempt.current?.message !== message) attempt.current = { message, id: crypto.randomUUID() };
    if (await onSend(message, attempt.current.id)) { setDraft(""); attempt.current = null; }
  };
  return <section className="space-y-4 rounded-2xl border bg-white p-4 sm:p-5" aria-label={dt("محادثة خطة Google Search")}>
    <h2 className="flex items-center gap-2 font-bold"><Bot size={20} />{dt("محادثة خطة Google Search")}</h2>
    <p className="text-xs leading-6 text-slate-500">{dt("ناقش البنية والكلمات والنتائج هنا. تُحفظ المحادثة مع الخطة، ويظهر الإجراء المقترح للمراجعة قبل تنفيذه.")}</p>
    <div role="log" aria-live="polite" aria-busy={sending} className="max-h-[28rem] space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3">
      <p dir="auto" className="ms-auto max-w-[95%] whitespace-pre-wrap break-words rounded-xl bg-brand p-3 text-sm leading-7 text-white">{prompt}</p>
      {summary ? <p dir="auto" className="max-w-[95%] whitespace-pre-wrap break-words rounded-xl border bg-white p-3 text-sm leading-7">{summary}</p> : null}
      {turns.map(turn => <div key={turn.requestId} className="space-y-2">
        <p dir="auto" className="ms-auto max-w-[95%] whitespace-pre-wrap break-words rounded-xl bg-brand p-3 text-sm leading-7 text-white">{turn.user}</p>
        <p dir="auto" className="max-w-[95%] whitespace-pre-wrap break-words rounded-xl border bg-white p-3 text-sm leading-7">{turn.assistant.reply}</p>
      </div>)}
      {sending ? <p role="status" className="text-sm text-brand">{dt("جار تحليل طلبك ضمن سياق الخطة…")}</p> : null}
    </div>
    {actionable ? <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
      <p className="text-xs text-slate-600">{dt("اقتراح جاهز للمراجعة؛ لم يُنفذ بعد.")}</p>
      <button type="button" disabled={disabled} className="rounded-lg border bg-white px-3 py-2.5 text-sm font-semibold disabled:opacity-40" onClick={() => onAction(recommendation, latest.assistant.suggestedDailyBudget)}>{dt(labels[recommendation])}</button>
    </div> : null}
    <form onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-2">
      <label className="block space-y-1 text-sm"><span>{dt("رسالتك للمساعد")}</span><textarea dir="auto" rows={3} maxLength={4000} value={draft} disabled={disabled} onChange={event => setDraft(event.target.value)} placeholder={dt("عدّل نصوص الحملة، أو اشرح النتائج وفرص التوسع…")} className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-50" /></label>
      <div className="flex items-center justify-between gap-3"><small className="text-slate-500">{draft.length}/4000</small><button type="submit" disabled={disabled || !draft.trim()} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><Send size={16} />{dt("إرسال للمساعد")}</button></div>
    </form>
  </section>;
}
