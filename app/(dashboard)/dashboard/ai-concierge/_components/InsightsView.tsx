"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import {
  AlertTriangle, Bot, CheckCircle2, CircleHelp, ClipboardPlus, FileQuestion, History, Lightbulb, ListChecks,
  Loader2, PackageSearch, Sparkles, ThumbsDown, ThumbsUp, Trash2, TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { cn } from "@/lib/utils";
import { DEFAULT_PERIOD, PeriodPicker, periodParams, type Period } from "./PeriodPicker";
import { INTENT_LABELS, LOCALE_LABELS, dateTime, num } from "./labels";

type Result = {
  summary: string;
  highlights: string[];
  missingCampaigns: Array<{ topic: string; mentions: number; evidence: string; suggestion: string }>;
  frequentQuestions: Array<{ question: string; mentions: number; answered: "yes" | "partly" | "no"; suggestedAnswer: string }>;
  issues: Array<{ title: string; detail: string; severity: "high" | "medium" | "low"; mentions: number; examples: string[] }>;
  conversionBlockers: Array<{ title: string; detail: string }>;
  contentGaps: Array<{ title: string; detail: string }>;
  assistantQuality: { score: number; strengths: string[]; weaknesses: string[] };
  sentiment: { positive: number; neutral: number; negative: number };
  recommendations: Array<{ title: string; detail: string; priority: "high" | "medium" | "low"; area: string }>;
  teamNotesSuggestion: string;
};
type Insight = { id: string; createdAt: string; createdByName: string | null; from: string; to: string; filters: Record<string, unknown> | null; conversationCount: number; messageCount: number; mode: string; model: string | null; result?: Result };

const ANY = "__any";
const PRIORITY: Record<string, { label: string; cls: string }> = {
  high: { label: "عالية", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  medium: { label: "متوسطة", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  low: { label: "منخفضة", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
};
const AREA: Record<string, string> = { campaigns: "المشاريع", content: "المحتوى", ux: "تجربة الموقع", payments: "الدفع", assistant: "المساعد", support: "الدعم", other: "أخرى" };
const ANSWERED: Record<string, { label: string; cls: string }> = {
  yes: { label: "يُجاب جيدًا", cls: "text-emerald-700 bg-emerald-50" },
  partly: { label: "إجابة جزئية", cls: "text-amber-700 bg-amber-50" },
  no: { label: "لا يُجاب", cls: "text-rose-700 bg-rose-50" },
};

export function InsightsView() {
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const [filters, setFilters] = useState<{ locale: string | null; intent: string | null; outcome: string | null; needsHuman: boolean; typedOnly: boolean }>({ locale: null, intent: null, outcome: null, needsHuman: false, typedOnly: true });
  const [history, setHistory] = useState<Insight[]>([]);
  const [provider, setProvider] = useState<{ ready: boolean; model: string | null; reason: string } | null>(null);
  const [selected, setSelected] = useState<Insight | null>(null);
  const [running, setRunning] = useState(false);
  const [loadingOne, setLoadingOne] = useState(false);

  const loadHistory = useCallback(async () => {
    const r = await fetch("/api/admin/ai/concierge/insights", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d = await r.json();
    setHistory(d.items);
    setProvider(d.provider);
    return d.items as Insight[];
  }, []);

  const open = useCallback(async (id: string) => {
    setLoadingOne(true);
    const r = await fetch(`/api/admin/ai/concierge/insights/${id}`, { cache: "no-store" }).catch(() => null);
    setLoadingOne(false);
    if (r?.ok) setSelected((await r.json()).insight);
  }, []);

  useEffect(() => {
    void loadHistory().then((items) => {
      if (items?.[0]) void open(items[0].id);
    });
  }, [loadHistory, open]);

  const run = async () => {
    setRunning(true);
    const p = periodParams(period);
    const body: Record<string, unknown> = { filters };
    if (p.get("from")) {
      body.from = p.get("from");
      if (p.get("to")) body.to = p.get("to");
    } else body.days = Number(p.get("days"));
    const r = await fetch("/api/admin/ai/concierge/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setRunning(false);
    const d = r ? await r.json().catch(() => null) : null;
    if (!r?.ok || !d?.insight) {
      toast.error(d?.error || "تعذّر تشغيل التحليل");
      return;
    }
    if (d.insight.mode !== "llm") toast(`تحليل إحصائي فقط: ${d.warning ?? "النموذج غير متاح"}`, { icon: "ℹ️" });
    else toast.success(`قرأ الذكاء الاصطناعي ${num(d.read)} محادثة`);
    setSelected(d.insight);
    void loadHistory();
  };

  const remove = async (id: string) => {
    if (!window.confirm("حذف هذا التحليل؟")) return;
    const r = await fetch(`/api/admin/ai/concierge/insights/${id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      if (selected?.id === id) setSelected(null);
      void loadHistory();
    }
  };

  const addToTeamNotes = async (text: string) => {
    const r = await fetch("/api/admin/ai/concierge/settings", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return toast.error("تعذّر قراءة الإعدادات");
    const { settings } = await r.json();
    const teamNotes = [settings.teamNotes?.trim(), text.trim()].filter(Boolean).join("\n").slice(0, 2000);
    const s = await fetch("/api/admin/ai/concierge/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: { ...settings, teamNotes } }) }).catch(() => null);
    if (s?.ok) toast.success("أُضيفت إلى ملاحظات الفريق  راجعها واملأ أي [فراغ] من صفحة الإعدادات");
    else toast.error("تعذّر الحفظ");
  };

  const res = selected?.result;

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      {/* Controls + history */}
      <div className="space-y-4">
        <SectionCard title="تحليل جديد" description="يقرأ الذكاء الاصطناعي المحادثات المختارة ويستخرج ما يجب تحسينه" icon={Sparkles}>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-[12px] font-medium text-slate-600">الفترة</p>
              <PeriodPicker value={period} onChange={setPeriod} />
            </div>
            <FilterRow label="النتيجة" value={filters.outcome} onChange={(v) => setFilters((f) => ({ ...f, outcome: v }))} placeholder="كل المحادثات" options={[{ value: "none", label: "لم تنتهِ بتبرع" }, { value: "donated", label: "انتهت بتبرع" }, { value: "direct", label: "تبرع مباشر" }]} />
            <FilterRow label="النية" value={filters.intent} onChange={(v) => setFilters((f) => ({ ...f, intent: v }))} placeholder="كل النوايا" options={Object.entries(INTENT_LABELS).map(([value, l]) => ({ value, label: l }))} />
            <FilterRow label="اللغة" value={filters.locale} onChange={(v) => setFilters((f) => ({ ...f, locale: v }))} placeholder="كل اللغات" options={Object.entries(LOCALE_LABELS).map(([value, l]) => ({ value, label: l }))} />
            <label className="flex items-center gap-2 text-[12.5px] text-slate-700">
              <input type="checkbox" checked={filters.typedOnly} onChange={(e) => setFilters((f) => ({ ...f, typedOnly: e.target.checked }))} className="accent-brand" />
              فقط المحادثات التي كتب فيها الزائر
            </label>
            <label className="flex items-center gap-2 text-[12.5px] text-slate-700">
              <input type="checkbox" checked={filters.needsHuman} onChange={(e) => setFilters((f) => ({ ...f, needsHuman: e.target.checked }))} className="accent-brand" />
              فقط ما احتاج متابعة الفريق
            </label>
            <Button onClick={run} disabled={running} className="w-full gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {running ? "يقرأ المحادثات… (قد يستغرق دقيقة)" : "لخّص واستنتج"}
            </Button>
            {provider && (
              <p className={cn("rounded-lg px-2.5 py-2 text-[11.5px] leading-5", provider.ready ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>
                {provider.ready ? `النموذج جاهز (${provider.model})` : `النموذج غير مفعّل  سيُعرض تحليل إحصائي فقط. ${provider.reason}`}
              </p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="التحليلات السابقة" icon={History} flush>
          {history.length === 0 ? (
            <EmptyState variant="inline" title="لا تحليلات بعد" description="شغّل أول تحليل من الأعلى." />
          ) : (
            <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
              {history.map((h) => (
                <li key={h.id} className={cn("group flex items-start gap-2 px-4 py-2.5", selected?.id === h.id && "bg-brand-50/60")}>
                  <button type="button" onClick={() => open(h.id)} className="min-w-0 flex-1 text-start">
                    <p className="text-[12.5px] font-medium text-slate-800">
                      {new Date(h.from).toLocaleDateString("ar-EG", { numberingSystem: "latn" })} ← {new Date(h.to).toLocaleDateString("ar-EG", { numberingSystem: "latn" })}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {num(h.conversationCount)} محادثة · {h.mode === "llm" ? "ذكاء اصطناعي" : "إحصائي"} · {h.createdByName ?? ""} · {dateTime(h.createdAt)}
                    </p>
                  </button>
                  <button type="button" onClick={() => remove(h.id)} className="mt-0.5 rounded p-1 text-slate-300 opacity-0 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100" aria-label="حذف">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Result */}
      <div className="min-w-0 space-y-5">
        {loadingOne && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-brand" />
          </div>
        )}
        {!loadingOne && !res && <EmptyState icon={Lightbulb} title="اختر فترة واضغط «لخّص واستنتج»" description="سيقرأ الذكاء الاصطناعي ما كتبه الزوار ويستخرج: المشاريع التي يطلبونها ولا نملكها، الأسئلة المتكررة، المشاكل، وما يمنعهم من التبرع  مع توصيات عملية." />}
        {!loadingOne && res && selected && (
          <>
            <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-18px_rgba(2,94,184,0.35)]">
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 bg-[radial-gradient(110%_140%_at_100%_0%,rgba(2,94,184,0.07),transparent_55%)]" />
              <div className="relative">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <Sparkles className="h-3.5 w-3.5 text-brand" /> الخلاصة
                  <span className="rounded-full border border-brand/20 bg-brand/5 px-2 py-0.5 normal-case text-brand">{num(selected.conversationCount)} محادثة · {num(selected.messageCount)} رسالة</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 normal-case text-slate-600">{selected.mode === "llm" ? `ذكاء اصطناعي${selected.model ? ` · ${selected.model}` : ""}` : "تحليل إحصائي"}</span>
                </div>
                <p className="mt-3 whitespace-pre-line text-[14.5px] leading-7 text-slate-800">{res.summary}</p>
                {res.highlights.length > 0 && (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {res.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> {h}
                      </li>
                    ))}
                  </ul>
                )}
                {selected.mode === "llm" && (
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:max-w-md">
                    <Sentiment icon={ThumbsUp} label="إيجابي" value={res.sentiment.positive} cls="text-emerald-600" />
                    <Sentiment icon={CircleHelp} label="محايد" value={res.sentiment.neutral} cls="text-slate-500" />
                    <Sentiment icon={ThumbsDown} label="سلبي" value={res.sentiment.negative} cls="text-rose-600" />
                  </div>
                )}
              </div>
            </section>

            {res.recommendations.length > 0 && (
              <SectionCard title="التوصيات" description="مرتبة حسب الأولوية" icon={ListChecks}>
                <ol className="space-y-2.5">
                  {[...res.recommendations].sort((a, b) => ["high", "medium", "low"].indexOf(a.priority) - ["high", "medium", "low"].indexOf(b.priority)).map((r, i) => (
                    <li key={i} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", PRIORITY[r.priority]?.cls)}>{PRIORITY[r.priority]?.label ?? r.priority}</span>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{AREA[r.area] ?? r.area}</span>
                        <p className="text-[13.5px] font-semibold text-slate-900">{r.title}</p>
                      </div>
                      <p className="mt-1 text-[13px] leading-6 text-slate-600">{r.detail}</p>
                    </li>
                  ))}
                </ol>
              </SectionCard>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <SectionCard title="مشاريع يطلبها الناس ولا نملكها" icon={PackageSearch}>
                {res.missingCampaigns.length === 0 ? (
                  <EmptyState variant="inline" title="لم تُرصد فجوات في المشاريع" />
                ) : (
                  <ul className="space-y-2.5">
                    {res.missingCampaigns.map((m, i) => (
                      <li key={i} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[13.5px] font-semibold text-slate-900">{m.topic}</p>
                          <span className="shrink-0 text-[11px] text-slate-500">{num(m.mentions)} محادثة</span>
                        </div>
                        {m.evidence && <p className="mt-1 border-s-2 border-brand/30 ps-2 text-[12.5px] italic text-slate-500">«{m.evidence}»</p>}
                        <p className="mt-1.5 text-[12.5px] text-slate-700">💡 {m.suggestion}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <SectionCard title="المشاكل المتكررة" icon={AlertTriangle}>
                {res.issues.length === 0 ? (
                  <EmptyState variant="inline" title="لا مشاكل بارزة" />
                ) : (
                  <ul className="space-y-2.5">
                    {res.issues.map((it, i) => (
                      <li key={i} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", PRIORITY[it.severity]?.cls)}>{PRIORITY[it.severity]?.label}</span>
                          <p className="text-[13.5px] font-semibold text-slate-900">{it.title}</p>
                          <span className="ms-auto text-[11px] text-slate-500">{num(it.mentions)}×</span>
                        </div>
                        <p className="mt-1 text-[12.5px] leading-6 text-slate-600">{it.detail}</p>
                        {it.examples.slice(0, 2).map((e, j) => (
                          <p key={j} className="mt-1 border-s-2 border-rose-200 ps-2 text-[12px] italic text-slate-500">«{e}»</p>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>

            <SectionCard title="الأسئلة المتكررة" description="يمكن نشرها في صفحة الأسئلة الشائعة لتحسين إجابات المساعد والموقع" icon={FileQuestion} flush>
              {res.frequentQuestions.length === 0 ? (
                <EmptyState variant="inline" title="لا أسئلة متكررة" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {res.frequentQuestions.map((q, i) => (
                    <li key={i} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13.5px] font-semibold text-slate-900">{q.question}</p>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", ANSWERED[q.answered]?.cls)}>{ANSWERED[q.answered]?.label}</span>
                        <span className="ms-auto text-[11px] text-slate-500">{num(q.mentions)}×</span>
                      </div>
                      {q.suggestedAnswer && <p className="mt-1 text-[12.5px] leading-6 text-slate-600">{q.suggestedAnswer}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <div className="grid gap-5 lg:grid-cols-2">
              <SimpleList title="ما يمنع الزوار من التبرع" icon={TrendingDown} items={res.conversionBlockers} />
              <SimpleList title="معلومات ناقصة في الموقع أو المساعد" icon={CircleHelp} items={res.contentGaps} />
            </div>

            {selected.mode === "llm" && (
              <SectionCard title={`جودة إجابات المساعد: ${res.assistantQuality.score}/10`} icon={Bot}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[12px] font-semibold text-emerald-700">نقاط القوة</p>
                    <ul className="list-disc space-y-1 ps-5 text-[12.5px] text-slate-700">{res.assistantQuality.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                  <div>
                    <p className="mb-1 text-[12px] font-semibold text-rose-700">نقاط الضعف</p>
                    <ul className="list-disc space-y-1 ps-5 text-[12.5px] text-slate-700">{res.assistantQuality.weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                </div>
              </SectionCard>
            )}

            {res.teamNotesSuggestion.trim() && (
              <SectionCard
                title="ملاحظات مقترحة للمساعد"
                description="أضفها إلى «ملاحظات الفريق» ليجيب المساعد عن هذه الفجوات  راجعها واملأ أي [فراغ] أولًا"
                icon={ClipboardPlus}
                actions={
                  <Button size="sm" variant="outline" onClick={() => addToTeamNotes(res.teamNotesSuggestion)} className="gap-1.5">
                    <ClipboardPlus className="h-4 w-4" /> أضف لملاحظات الفريق
                  </Button>
                }
              >
                <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-[12.5px] leading-6 text-slate-700">{res.teamNotesSuggestion}</pre>
              </SectionCard>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FilterRow({ label: l, value, onChange, placeholder, options }: { label: string; value: string | null; onChange: (v: string | null) => void; placeholder: string; options: Array<{ value: string; label: string }> }) {
  return (
    <div>
      <p className="mb-1 text-[12px] font-medium text-slate-600">{l}</p>
      <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? null : v)} dir="rtl">
        <SelectTrigger className="h-9 bg-white text-[13px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY} className="text-[13px]">{placeholder}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-[13px]">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Sentiment({ icon: Icon, label: l, value, cls }: { icon: typeof ThumbsUp; label: string; value: number; cls: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">
      <Icon className={cn("mx-auto h-4 w-4", cls)} />
      <p className="mt-1 text-[16px] font-bold tabular-nums text-slate-900">{value}%</p>
      <p className="text-[11px] text-slate-500">{l}</p>
    </div>
  );
}

function SimpleList({ title, icon, items }: { title: string; icon: typeof Bot; items: Array<{ title: string; detail: string }> }) {
  return (
    <SectionCard title={title} icon={icon}>
      {items.length === 0 ? (
        <EmptyState variant="inline" title="لا شيء بارز" />
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i}>
              <p className="text-[13px] font-semibold text-slate-900">{it.title}</p>
              <p className="text-[12.5px] leading-6 text-slate-600">{it.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

