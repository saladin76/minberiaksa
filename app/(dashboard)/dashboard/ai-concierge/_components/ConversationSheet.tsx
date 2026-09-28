"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { AlertTriangle, Bot, HandCoins, Loader2, MousePointerClick, ShoppingCart, Trash2, User } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BLOCK_LABELS, EVENT_LABELS, INTENT_LABELS, LOCALE_LABELS, ROUTE_LABELS, dateTime, label, usd } from "./labels";

type Turn = { role: string; kind: string; text: string; at: string; intent: string | null; mode: string | null; blocks: string[]; campaignIds: string[]; needsHuman: boolean | null };
type Detail = {
  conversation: {
    id: string; sessionId: string; locale: string; firstRoute: string | null; firstPath: string | null; turns: Turn[];
    intents: string[]; needsHuman: boolean; fallbackCount: number; startedAt: string; lastMessageAt: string; userMessageCount: number;
  };
  user: { id: string; name: string | null; email: string | null; phone: string | null; countryCode: string | null } | null;
  events: Array<{ event: string; createdAt: string; amountUSD: number | null; frequency: string | null }>;
  campaigns: Array<{ id: string; title: string; slug: string }>;
  donations: Array<{ id: string; kind: "direct" | "indirect"; via: string; usd: number; amount: number; currency: string; createdAt: string; recurring: boolean }>;
  windowDays: number;
};

const VIA_LABEL: Record<string, string> = { basket: "أُضيف للسلة من المساعد", touch: "من المتصفح نفسه لاحقًا", account: "من حساب المتبرع لاحقًا" };

/** One conversation in full, in a side sheet over the list. */
export function ConversationSheet({ id, onClose, onDeleted }: { id: string | null; onClose: () => void; onDeleted: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/ai/concierge/conversations/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && toast.error("تعذّر تحميل المحادثة"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const remove = async () => {
    if (!id || !window.confirm("حذف نص هذه المحادثة نهائيًا؟ تبقى أرقام التحليلات كما هي.")) return;
    setDeleting(true);
    const r = await fetch(`/api/admin/ai/concierge/conversations/${id}`, { method: "DELETE" }).catch(() => null);
    setDeleting(false);
    if (r?.ok) {
      toast.success("حُذفت المحادثة");
      onDeleted();
    } else toast.error("تعذّر الحذف");
  };

  const titleOf = new Map((data?.campaigns ?? []).map((c) => [c.id, c.title]));
  const c = data?.conversation;

  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="left" className="w-full overflow-y-auto p-0 sm:max-w-[620px]" dir="rtl">
        <SheetHeader className="sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4 text-start">
          <SheetTitle className="flex items-center gap-2 text-[16px]">
            <User className="h-4 w-4 text-slate-400" />
            {data?.user?.name || data?.user?.email || "زائر غير مسجّل"}
          </SheetTitle>
          <SheetDescription className="text-[12px]">
            {c ? `${dateTime(c.startedAt)} · ${label(LOCALE_LABELS, c.locale)} · فُتح من ${label(ROUTE_LABELS, c.firstRoute)}` : " "}
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="flex h-60 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-brand" />
          </div>
        )}

        {data && c && !loading && (
          <div className="space-y-5 px-5 py-4">
            {/* Summary chips */}
            <div className="flex flex-wrap gap-1.5">
              {c.intents.map((i) => (
                <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11.5px] text-slate-700">{label(INTENT_LABELS, i)}</span>
              ))}
              {c.needsHuman && <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11.5px] font-semibold text-rose-700">تحتاج متابعة الفريق</span>}
              {c.fallbackCount > 0 && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11.5px] font-semibold text-amber-700">{c.fallbackCount} رد بدون النموذج</span>}
            </div>

            {data.user && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[12.5px] text-slate-600">
                <p className="font-semibold text-slate-800">متبرع مسجّل</p>
                <p className="mt-0.5">{[data.user.email, data.user.phone, data.user.countryCode].filter(Boolean).join(" · ")}</p>
              </div>
            )}

            {data.donations.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-800">
                  <HandCoins className="h-4 w-4" /> تبرعات مرتبطة بهذه المحادثة
                </p>
                <ul className="mt-2 space-y-1 text-[12.5px] text-emerald-900">
                  {data.donations.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <b>{d.kind === "direct" ? "مباشر" : "غير مباشر"}</b> — {VIA_LABEL[d.via] ?? d.via}
                        {d.recurring ? " · دوري" : ""}
                      </span>
                      <span className="tabular-nums">
                        {d.amount.toLocaleString("en-US")} {d.currency} ({usd(d.usd)}) · {dateTime(d.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Transcript */}
            <div className="space-y-3">
              {c.turns.map((t, i) =>
                t.role === "user" ? (
                  t.kind === "message" ? (
                    <div key={i} className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl rounded-ss-sm bg-brand px-3.5 py-2 text-[13.5px] leading-6 text-white">
                        {t.text}
                        <div className="mt-0.5 text-[10px] text-white/70">{dateTime(t.at)}</div>
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex justify-start">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px]", t.kind === "added" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600")}>
                        {t.kind === "added" ? <ShoppingCart className="h-3.5 w-3.5" /> : <MousePointerClick className="h-3.5 w-3.5" />}
                        {t.kind === "added" ? "أضاف تبرعًا للسلة: " : "ضغط: "}
                        {t.text}
                        {t.campaignIds.length > 0 && <span className="text-slate-400">({t.campaignIds.map((id) => titleOf.get(id) ?? id).join("، ")})</span>}
                      </span>
                    </div>
                  )
                ) : (
                  <div key={i} className="flex justify-end">
                    <div className={cn("max-w-[88%] rounded-2xl rounded-se-sm border px-3.5 py-2 text-[13.5px] leading-6", t.needsHuman ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-slate-50")}>
                      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-slate-400">
                        <Bot className="h-3 w-3" />
                        {t.mode === "llm" ? "ذكاء اصطناعي" : "مسار ثابت"}
                        {t.intent && <span>· {label(INTENT_LABELS, t.intent)}</span>}
                        {t.needsHuman && (
                          <span className="inline-flex items-center gap-0.5 text-rose-600">
                            <AlertTriangle className="h-3 w-3" /> خارج معرفته
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-slate-800">{t.text || <span className="text-slate-400">(بدون نص)</span>}</p>
                      {(t.blocks.length > 0 || t.campaignIds.length > 0) && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {t.blocks.map((b, j) => (
                            <span key={j} className="rounded bg-white px-1.5 py-0.5 text-[10.5px] text-slate-500 ring-1 ring-slate-200">{label(BLOCK_LABELS, b)}</span>
                          ))}
                          {t.campaignIds.map((id) => (
                            <span key={id} className="rounded bg-brand-50 px-1.5 py-0.5 text-[10.5px] text-brand">{titleOf.get(id) ?? id}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Funnel timeline */}
            {data.events.length > 0 && (
              <details className="rounded-xl border border-slate-200 p-3">
                <summary className="cursor-pointer text-[13px] font-semibold text-slate-700">خطوات الجلسة ({data.events.length})</summary>
                <ol className="mt-2 space-y-1 text-[12px] text-slate-600">
                  {data.events.map((e, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>
                        {label(EVENT_LABELS, e.event)}
                        {e.amountUSD ? ` — ${usd(e.amountUSD)}${e.frequency ? ` · ${e.frequency}` : ""}` : ""}
                      </span>
                      <span className="tabular-nums text-slate-400">{dateTime(e.createdAt)}</span>
                    </li>
                  ))}
                </ol>
              </details>
            )}

            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400">
              <span dir="ltr">session {c.sessionId}</span>
              <Button variant="ghost" size="sm" onClick={remove} disabled={deleting} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} حذف المحادثة
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
