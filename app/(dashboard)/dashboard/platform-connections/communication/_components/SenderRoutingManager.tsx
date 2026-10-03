"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Route, Send, ShieldCheck, TriangleAlert, Star } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { cn } from "@/lib/utils";

/**
 * Senders and routing rules.
 *
 * The services behind this were written and then never surfaced: the platform could route between
 * several business numbers, but with no screen to create one, every message in practice left from the
 * single environment default. Two things this deliberately makes visible:
 *
 * The environment default is shown as what it is  the fallback for a channel with *no* senders at
 * all. Once a sender exists for a channel, routing decides, and a rule that declines to serve a
 * recipient is final. An operator reading this page should be able to predict that.
 *
 * And the preview answers the only question rules exist to answer: which number would serve this
 * locale, country and purpose? It runs through the same resolver the sender uses, so it cannot
 * flatter itself  including by reporting a refusal as a refusal.
 */

const CHANNELS = ["WHATSAPP", "EMAIL", "SMS"] as const;
const PURPOSES = ["TRANSACTIONAL", "MARKETING", "UTILITY", "AUTHENTICATION"] as const;

const SUPPORTED_LANGUAGES = [
  ["ar", "العربية"], ["tr", "Türkçe"], ["en", "English"], ["fr", "Français"], ["de", "Deutsch"],
  ["es", "Español"], ["id", "Bahasa Indonesia"], ["pt", "Português"], ["ur", "اردو"], ["sq", "Shqip"],
  ["it", "Italiano"], ["nl", "Nederlands"], ["sv", "Svenska"], ["no", "Norsk"], ["da", "Dansk"],
  ["ms", "Bahasa Melayu"], ["ja", "日本語"], ["zh", "中文"], ["hi", "हिंदी"],
] as const;

const CHANNEL_LABELS: Record<string, string> = { WHATSAPP: "واتساب", EMAIL: "بريد", SMS: "رسائل نصية" };
const PURPOSE_LABELS: Record<string, string> = {
  TRANSACTIONAL: "معاملات", MARKETING: "تسويق", UTILITY: "خدمي", AUTHENTICATION: "توثيق",
};

type Sender = {
  id: string;
  channel: string;
  provider: string;
  name: string;
  displayName: string | null;
  displayPhoneNumber: string | null;
  hasPhoneNumberId: boolean;
  senderEmail: string | null;
  smsSender: string | null;
  supportedLocales: string[];
  supportedCountries: string[];
  supportedPurposes: string[];
  status: string;
  qualityRating: string | null;
  isDefault: boolean;
  enabled: boolean;
  priority: number;
};

type Rule = {
  id: string;
  channel: string;
  locale: string | null;
  country: string | null;
  purpose: string | null;
  senderId: string;
  fallbackSenderId: string | null;
  priority: number;
  enabled: boolean;
  notes: string | null;
};

type Payload = {
  senders: Sender[];
  rules: Rule[];
  environmentDefaults: Record<string, boolean>;
};

type Preview =
  | { wouldSend: true; matchedBy: string; sender: { id: string | null; displayPhoneNumber: string | null; senderEmail: string | null; smsSender: string | null; provider: string | null } }
  | { wouldSend: false; reason: string };

const MATCHED_BY_LABELS: Record<string, string> = {
  rule: "بقاعدة توجيه صريحة",
  capability: "بمطابقة قدرات المُرسِل",
  default: "بالمُرسِل الافتراضي للقناة",
  "runtime-default": "بإعداد البيئة (لا يوجد مُرسِل مُسجَّل لهذه القناة)",
};

function senderIdentity(sender: Sender): string {
  return sender.displayPhoneNumber || sender.senderEmail || sender.smsSender || "—";
}

export function SenderRoutingManager() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [showSenderForm, setShowSenderForm] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/communication/senders", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "load failed");
      setData({ senders: body.senders, rules: body.rules, environmentDefaults: body.environmentDefaults });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const patchSender = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/dashboard/communication/senders/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice({ tone: "error", text: body.error ?? "تعذّر الحفظ." }); return; }
      setNotice({ tone: "ok", text: "حُفظ." });
      await load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  const byChannel = useMemo(() => {
    const map = new Map<string, Sender[]>();
    for (const channel of CHANNELS) map.set(channel, []);
    for (const sender of data?.senders ?? []) map.get(sender.channel)?.push(sender);
    return map;
  }, [data]);

  const senderName = useCallback(
    (id: string | null) => (id ? data?.senders.find((s) => s.id === id)?.name ?? id : "—"),
    [data],
  );

  return (
    <section dir="rtl" className="mt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">المُرسِلون والتوجيه</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            أرقام الأعمال وهويات الإرسال، وقواعد اختيار المُرسِل حسب اللغة والدولة والغرض.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> تحديث
          </button>
          <button
            type="button"
            onClick={() => setShowSenderForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white"
          >
            <Plus className="w-4 h-4" /> مُرسِل جديد
          </button>
        </div>
      </div>

      {notice && (
        <p className={cn("mb-3 text-sm font-medium", notice.tone === "ok" ? "text-emerald-700" : "text-rose-700")}>
          {notice.text}
        </p>
      )}

      {showSenderForm && <SenderForm onDone={async () => { setShowSenderForm(false); await load(); }} />}

      {loading && !data ? (
        <div className="flex items-center justify-center py-12 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : !data ? (
        <EmptyState variant="inline" title="تعذّر تحميل المُرسِلين" />
      ) : (
        <div className="space-y-6">
          {CHANNELS.map((channel) => {
            const senders = byChannel.get(channel) ?? [];
            const envDefault = data.environmentDefaults[channel];
            return (
              <div key={channel} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                  <h3 className="text-sm font-bold text-slate-900">{CHANNEL_LABELS[channel]}</h3>
                  {senders.length === 0 ? (
                    /* Stated plainly, because it is the ONE case the environment default still serves 
                       and because adding the first sender changes that behaviour. */
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                      envDefault ? "border-slate-200 bg-slate-50 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-700",
                    )}>
                      {envDefault ? <ShieldCheck className="w-3 h-3" /> : <TriangleAlert className="w-3 h-3" />}
                      {envDefault ? "يُستخدم إعداد البيئة" : "لا مُرسِل ولا إعداد بيئة  القناة صامتة"}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-500">{senders.length} مُرسِل</span>
                  )}
                </div>

                {senders.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-slate-500">
                    لا يوجد مُرسِل مُسجَّل لهذه القناة. عند إضافة أول مُرسِل يتوقّف استخدام إعداد البيئة ويصبح التوجيه هو المُحدِّد.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {senders.map((sender) => (
                      <li key={sender.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                              {sender.displayName || sender.name}
                              {sender.isDefault && <Star className="w-3.5 h-3.5 text-amber-500" />}
                            </p>
                            <p className="text-xs text-slate-500">
                              {senderIdentity(sender)} · {sender.provider}
                              {sender.channel === "WHATSAPP" && !sender.hasPhoneNumberId && (
                                <span className="text-rose-600"> · بلا معرّف رقم من Meta</span>
                              )}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {sender.supportedLocales.length ? `لغات: ${sender.supportedLocales.join(", ")}` : "كل اللغات"}
                              {" · "}
                              {sender.supportedCountries.length ? `دول: ${sender.supportedCountries.join(", ")}` : "كل الدول"}
                              {" · "}
                              {sender.supportedPurposes.length ? sender.supportedPurposes.map((p) => PURPOSE_LABELS[p] ?? p).join(", ") : "كل الأغراض"}
                              {" · "}أولوية {sender.priority}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                              sender.status === "ACTIVE" && sender.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : sender.status === "NEEDS_ATTENTION" ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-slate-200 bg-slate-50 text-slate-500",
                            )}>
                              {sender.enabled ? (sender.status === "ACTIVE" ? "نشط" : sender.status === "NEEDS_ATTENTION" ? "يحتاج انتباهًا" : sender.status) : "معطّل"}
                            </span>
                            <button
                              type="button"
                              disabled={busy === sender.id}
                              onClick={() => void patchSender(sender.id, { enabled: !sender.enabled })}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                            >
                              {sender.enabled ? "تعطيل" : "تفعيل"}
                            </button>
                            {!sender.isDefault && (
                              <button
                                type="button"
                                disabled={busy === sender.id}
                                onClick={() => void patchSender(sender.id, { makeDefault: true })}
                                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                              >
                                اجعله الافتراضي
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {/* ── Rules ──────────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
              <h3 className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
                <Route className="w-4 h-4 text-brand" /> قواعد التوجيه
              </h3>
              <button
                type="button"
                onClick={() => setShowRuleForm((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Plus className="w-3.5 h-3.5" /> قاعدة جديدة
              </button>
            </div>
            {showRuleForm && <RuleForm senders={data.senders} onDone={async () => { setShowRuleForm(false); await load(); }} />}
            {data.rules.length === 0 ? (
              <p className="px-4 py-4 text-xs text-slate-500">
                لا قواعد  يُختار المُرسِل بمطابقة قدراته ثم بالمُرسِل الافتراضي للقناة.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.rules.map((rule) => (
                  <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <p className="text-sm text-slate-800">
                      <span className="font-semibold">{CHANNEL_LABELS[rule.channel] ?? rule.channel}</span>
                      {" · "}
                      {rule.locale ? `لغة ${rule.locale}` : "أي لغة"}
                      {" · "}
                      {rule.country ? `دولة ${rule.country}` : "أي دولة"}
                      {" · "}
                      {rule.purpose ? PURPOSE_LABELS[rule.purpose] ?? rule.purpose : "أي غرض"}
                      {" → "}
                      <span className="font-semibold">{senderName(rule.senderId)}</span>
                      {rule.fallbackSenderId && <span className="text-slate-500"> (بديل: {senderName(rule.fallbackSenderId)})</span>}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">أولوية {rule.priority}</span>
                      <button
                        type="button"
                        onClick={() => void (async () => {
                          const res = await fetch(`/api/dashboard/communication/routing-rules/${rule.id}`, {
                            method: "PATCH",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ enabled: !rule.enabled }),
                          });
                          if (res.ok) await load();
                        })()}
                        className={cn(
                          "rounded-lg border px-2 py-0.5 text-[11px] font-semibold",
                          rule.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500",
                        )}
                      >
                        {rule.enabled ? "مفعّلة" : "معطّلة"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <RoutingPreview />
        </div>
      )}
    </section>
  );
}

/** Creating a sender. Only the fields the chosen channel actually uses are asked for. */
function SenderForm({ onDone }: { onDone: () => Promise<void> }) {
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("WHATSAPP");
  const [form, setForm] = useState({
    name: "", displayName: "", phoneNumberId: "", displayPhoneNumber: "", businessAccountId: "",
    senderEmail: "", smsSender: "", supportedCountries: "", priority: "100",
  });
  const [locales, setLocales] = useState<string[]>([]);
  const [purposes, setPurposes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const list = (value: string) => value.split(",").map((v) => v.trim()).filter(Boolean);
      const res = await fetch("/api/dashboard/communication/senders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel,
          provider: channel === "WHATSAPP" ? "META_WHATSAPP" : channel === "EMAIL" ? "ELASTIC_EMAIL" : "NETGSM_SMS",
          name: form.name,
          displayName: form.displayName || null,
          phoneNumberId: channel === "WHATSAPP" ? form.phoneNumberId || null : null,
          displayPhoneNumber: channel === "WHATSAPP" ? form.displayPhoneNumber || null : null,
          businessAccountId: channel === "WHATSAPP" ? form.businessAccountId || null : null,
          senderEmail: channel === "EMAIL" ? form.senderEmail || null : null,
          smsSender: channel === "SMS" ? form.smsSender || null : null,
          supportedLocales: locales,
          supportedCountries: list(form.supportedCountries).map((c) => c.toUpperCase()),
          supportedPurposes: purposes,
          priority: Number(form.priority) || 100,
          status: "ACTIVE",
          enabled: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "تعذّر الإنشاء."); return; }
      await onDone();
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400";

  return (
    <div className="mb-5 rounded-xl border border-brand/20 bg-brand/5 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-semibold text-slate-600">
          القناة
          <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} className={cn(field, "mt-1")}>
            {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          الاسم الداخلي
          <input value={form.name} onChange={set("name")} placeholder="الرقم التسويقي" className={cn(field, "mt-1")} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          الاسم الظاهر
          <input value={form.displayName} onChange={set("displayName")} className={cn(field, "mt-1")} />
        </label>

        {channel === "WHATSAPP" && (
          <>
            <label className="text-xs font-semibold text-slate-600">
              معرّف الرقم في Meta
              <input value={form.phoneNumberId} onChange={set("phoneNumberId")} className={cn(field, "mt-1")} />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              الرقم كما يظهر
              <input value={form.displayPhoneNumber} onChange={set("displayPhoneNumber")} placeholder="+90…" className={cn(field, "mt-1")} />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              معرّف حساب الأعمال
              <input value={form.businessAccountId} onChange={set("businessAccountId")} className={cn(field, "mt-1")} />
            </label>
          </>
        )}
        {channel === "EMAIL" && (
          <label className="text-xs font-semibold text-slate-600">
            بريد المُرسِل
            <input value={form.senderEmail} onChange={set("senderEmail")} className={cn(field, "mt-1")} />
          </label>
        )}
        {channel === "SMS" && (
          <label className="text-xs font-semibold text-slate-600">
            ترويسة الرسائل
            <input value={form.smsSender} onChange={set("smsSender")} className={cn(field, "mt-1")} />
          </label>
        )}

        <div className="text-xs font-semibold text-slate-600 sm:col-span-2 lg:col-span-3">
          <p>اللغات المدعومة <span className="font-normal text-slate-400">(بدون اختيار = كل اللغات)</span></p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SUPPORTED_LANGUAGES.map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => setLocales((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code])}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  locales.includes(code) ? "border-brand/30 bg-brand/10 text-brand" : "border-slate-200 bg-white text-slate-500",
                )}
              >
                {label} <span className="ms-1 text-[10px] opacity-60">{code}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="text-xs font-semibold text-slate-600">
          الدول المدعومة (فراغ = الكل)
          <input value={form.supportedCountries} onChange={set("supportedCountries")} placeholder="TR, SA" className={cn(field, "mt-1")} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          الأولوية (الأصغر أولًا)
          <input value={form.priority} onChange={set("priority")} className={cn(field, "mt-1")} />
        </label>
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold text-slate-600">الأغراض المدعومة (فراغ = الكل)</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {PURPOSES.map((purpose) => (
            <button
              key={purpose}
              type="button"
              onClick={() => setPurposes((p) => (p.includes(purpose) ? p.filter((x) => x !== purpose) : [...p, purpose]))}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                purposes.includes(purpose) ? "border-brand/30 bg-brand/10 text-brand" : "border-slate-200 bg-white text-slate-500",
              )}
            >
              {PURPOSE_LABELS[purpose]}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-2 text-xs font-medium text-rose-700">{error}</p>}
      <button
        type="button"
        disabled={saving || !form.name.trim()}
        onClick={() => void submit()}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} حفظ المُرسِل
      </button>
    </div>
  );
}

function RuleForm({ senders, onDone }: { senders: Sender[]; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ channel: "WHATSAPP", locale: "", country: "", purpose: "", senderId: "", fallbackSenderId: "", priority: "100" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = senders.filter((s) => s.channel === form.channel);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/communication/routing-rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel: form.channel,
          locale: form.locale.trim() || null,
          country: form.country.trim().toUpperCase() || null,
          purpose: form.purpose || null,
          senderId: form.senderId,
          fallbackSenderId: form.fallbackSenderId || null,
          priority: Number(form.priority) || 100,
          enabled: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "تعذّر الإنشاء."); return; }
      await onDone();
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800";

  return (
    <div className="border-b border-slate-100 bg-slate-50/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold text-slate-600">
          القناة
          <select value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value, senderId: "", fallbackSenderId: "" }))} className={cn(field, "mt-1")}>
            {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          اللغة (فراغ = أي)
          <input value={form.locale} onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))} placeholder="tr" className={cn(field, "mt-1")} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          الدولة (فراغ = أي)
          <input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} placeholder="TR" className={cn(field, "mt-1")} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          الغرض (فراغ = أي)
          <select value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} className={cn(field, "mt-1")}>
            <option value="">أي غرض</option>
            {PURPOSES.map((p) => <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          المُرسِل
          <select value={form.senderId} onChange={(e) => setForm((f) => ({ ...f, senderId: e.target.value }))} className={cn(field, "mt-1")}>
            <option value="">اختر…</option>
            {options.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          البديل عند تعذّره
          <select value={form.fallbackSenderId} onChange={(e) => setForm((f) => ({ ...f, fallbackSenderId: e.target.value }))} className={cn(field, "mt-1")}>
            <option value="">لا شيء</option>
            {options.filter((s) => s.id !== form.senderId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          الأولوية
          <input value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={cn(field, "mt-1")} />
        </label>
      </div>
      {error && <p className="mt-2 text-xs font-medium text-rose-700">{error}</p>}
      <button
        type="button"
        disabled={saving || !form.senderId}
        onClick={() => void submit()}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} حفظ القاعدة
      </button>
    </div>
  );
}

/** "Which number would serve this recipient?"  answered by the resolver the sender itself uses. */
function RoutingPreview() {
  const [form, setForm] = useState({ channel: "WHATSAPP", locale: "ar", country: "", purpose: "TRANSACTIONAL" });
  const [result, setResult] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ channel: form.channel, purpose: form.purpose });
      if (form.locale.trim()) params.set("locale", form.locale.trim());
      if (form.country.trim()) params.set("country", form.country.trim().toUpperCase());
      const res = await fetch(`/api/dashboard/communication/routing-rules?${params}`, { cache: "no-store" });
      const body = await res.json();
      setResult(res.ok && body.ok ? body : null);
    } finally {
      setLoading(false);
    }
  }, [form]);

  const field = "rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
        <Send className="w-4 h-4 text-brand" /> اختبار التوجيه
      </h3>
      <p className="mt-0.5 text-xs text-slate-500">
        أيّ مُرسِل سيخدم مستلمًا بهذه الصفات؟ الجواب من نفس المُحلِّل الذي يستخدمه الإرسال الفعلي.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <select value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))} className={field}>
          {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
        </select>
        <input value={form.locale} onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))} placeholder="اللغة" className={cn(field, "w-24")} />
        <input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} placeholder="الدولة" className={cn(field, "w-24")} />
        <select value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} className={field}>
          {PURPOSES.map((p) => <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>)}
        </select>
        <button
          type="button"
          onClick={() => void run()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} اختبر
        </button>
      </div>

      {result && (
        result.wouldSend ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            سيُرسَل من{" "}
            <span className="font-semibold">
              {result.sender.displayPhoneNumber || result.sender.senderEmail || result.sender.smsSender || result.sender.provider || "—"}
            </span>
            {"  "}{MATCHED_BY_LABELS[result.matchedBy] ?? result.matchedBy}
          </p>
        ) : (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <TriangleAlert className="inline w-4 h-4 me-1" />
            لن يُرسَل إلى هذا المستلم  {result.reason}. هذا قرار نهائي: لا يوجد بديل من إعداد البيئة يتجاوزه.
          </p>
        )
      )}
    </div>
  );
}
