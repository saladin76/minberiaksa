"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, Pencil, Plus, RefreshCw, Route, Search, Send, ShieldCheck, Star, Trash2, TriangleAlert, X } from "lucide-react";
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
  phoneNumberId: string | null;
  businessAccountId: string | null;
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

type MetaAssetsPayload = {
  businessPortfolio: { id: string; name: string | null };
  wabas: Array<{
    id: string;
    name: string | null;
    relationship: "OWNED" | "CLIENT";
    phones: Array<{
      id: string;
      displayPhoneNumber: string | null;
      verifiedName: string | null;
      qualityRating: string | null;
    }>;
  }>;
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

type RuleGroup = {
  key: string;
  representative: Rule;
  members: Rule[];
  locales: string[];
};

/** Locale rows are an implementation detail: operators edit one logical route with many languages. */
function ruleFamilyKey(rule: Rule): string {
  return [
    rule.channel,
    rule.country ?? "*",
    rule.purpose ?? "*",
    rule.senderId,
    rule.fallbackSenderId ?? "*",
    String(rule.priority),
    rule.enabled ? "1" : "0",
  ].join("|");
}

function groupRoutingRules(rules: Rule[]): RuleGroup[] {
  const grouped = new Map<string, Rule[]>();
  for (const rule of rules) {
    const key = ruleFamilyKey(rule);
    grouped.set(key, [...(grouped.get(key) ?? []), rule]);
  }
  return [...grouped.entries()].map(([key, members]) => ({
    key,
    representative: members[0],
    members,
    locales: members.some((rule) => !rule.locale)
      ? []
      : members.map((rule) => rule.locale!).sort(),
  }));
}

export function SenderRoutingManager() {
  const [data, setData] = useState<Payload | null>(null);
  const [metaAssets, setMetaAssets] = useState<MetaAssetsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [showSenderForm, setShowSenderForm] = useState(false);
  const [editingSenderId, setEditingSenderId] = useState<string | null>(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/communication/senders", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "load failed");
      setData({ senders: body.senders, rules: body.rules, environmentDefaults: body.environmentDefaults });

      const metaRes = await fetch("/api/dashboard/communication/meta-assets", { cache: "no-store" }).catch(() => null);
      if (metaRes?.ok) {
        const metaBody = await metaRes.json().catch(() => null);
        setMetaAssets(metaBody?.ok ? { businessPortfolio: metaBody.businessPortfolio, wabas: metaBody.wabas } : null);
      } else {
        setMetaAssets(null);
      }
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

  const removeSender = useCallback(async (sender: Sender) => {
    const confirmed = window.confirm(
      `هل أنت متأكد من حذف المُرسِل «${sender.displayName || sender.name}»؟\n\nإذا كان مستخدمًا في قواعد التوجيه أو سجل الإرسال فسيمنع النظام الحذف حفاظًا على البيانات.`
    );
    if (!confirmed) return;

    setBusy(sender.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/dashboard/communication/senders/${sender.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ tone: "error", text: body.error ?? "تعذّر حذف المُرسِل." });
        return;
      }
      setEditingSenderId((current) => current === sender.id ? null : current);
      setNotice({ tone: "ok", text: "تم حذف المُرسِل." });
      await load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  const removeRule = useCallback(async (rule: Rule) => {
    const confirmed = window.confirm("هل أنت متأكد من حذف قاعدة التوجيه هذه؟");
    if (!confirmed) return;

    setBusy(`rule:${rule.id}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/dashboard/communication/routing-rules/${rule.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ tone: "error", text: body.error ?? "تعذّر حذف قاعدة التوجيه." });
        return;
      }
      setEditingRuleId((current) => current === rule.id ? null : current);
      setNotice({ tone: "ok", text: "تم حذف قاعدة التوجيه." });
      await load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  const removeRuleGroup = useCallback(async (group: RuleGroup) => {
    const label = group.locales.length ? group.locales.join("، ") : "كل اللغات";
    const confirmed = window.confirm(`هل تريد حذف قاعدة التوجيه لهذه اللغات: ${label}؟`);
    if (!confirmed) return;

    const busyKey = `rule-group:${group.key}`;
    setBusy(busyKey);
    setNotice(null);
    try {
      for (const member of group.members) {
        const res = await fetch(`/api/dashboard/communication/routing-rules/${member.id}`, { method: "DELETE" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setNotice({ tone: "error", text: body.error ?? "تعذّر حذف مجموعة قواعد التوجيه بالكامل." });
          await load();
          return;
        }
      }
      setEditingRuleId(null);
      setNotice({ tone: "ok", text: "تم حذف قاعدة التوجيه بكل لغاتها." });
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

  const groupedRules = useMemo(() => groupRoutingRules(data?.rules ?? []), [data?.rules]);

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

      {showSenderForm && (
        <SenderForm
          metaAssets={metaAssets}
          onCancel={() => setShowSenderForm(false)}
          onDone={async () => { setShowSenderForm(false); await load(); }}
        />
      )}

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
                            {sender.channel === "WHATSAPP" && (
                              <button
                                type="button"
                                disabled={busy === sender.id}
                                onClick={() => void (async () => {
                                  setBusy(sender.id);
                                  setNotice(null);
                                  try {
                                    const res = await fetch(`/api/dashboard/communication/senders/${sender.id}/verify`, { method: "POST" });
                                    const body = await res.json().catch(() => ({}));
                                    if (!res.ok) {
                                      setNotice({ tone: "error", text: body.error ?? "فشل التحقق من Meta." });
                                      await load();
                                      return;
                                    }
                                    setNotice({ tone: "ok", text: "تم التحقق من الرقم وWABA عبر Meta وتفعيل المُرسِل." });
                                    await load();
                                  } finally {
                                    setBusy(null);
                                  }
                                })()}
                                className="rounded-lg border border-sky-200 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-40"
                              >
                                تحقق من Meta
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy === sender.id}
                              onClick={() => setEditingSenderId((current) => current === sender.id ? null : sender.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                            >
                              <Pencil className="h-3.5 w-3.5" /> تعديل
                            </button>
                            <button
                              type="button"
                              disabled={busy === sender.id}
                              onClick={() => void removeSender(sender)}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> حذف
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
                        {editingSenderId === sender.id && (
                          <div className="mt-3 border-t border-slate-100 pt-3">
                            <SenderForm
                              sender={sender}
                              metaAssets={metaAssets}
                              onCancel={() => setEditingSenderId(null)}
                              onDone={async () => { setEditingSenderId(null); await load(); }}
                            />
                          </div>
                        )}
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
            {showRuleForm && <RuleForm senders={data.senders} onCancel={() => setShowRuleForm(false)} onDone={async () => { setShowRuleForm(false); await load(); }} />}
            {groupedRules.length === 0 ? (
              <p className="px-4 py-4 text-xs text-slate-500">
                لا قواعد  يُختار المُرسِل بمطابقة قدراته ثم بالمُرسِل الافتراضي للقناة.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {groupedRules.map((group) => {
                  const rule = group.representative;
                  const busyKey = `rule-group:${group.key}`;
                  const languageLabel = group.locales.length
                    ? `لغات ${group.locales.join("، ")}`
                    : "كل اللغات";
                  return (
                    <li key={group.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <p className="text-sm text-slate-800">
                        <span className="font-semibold">{CHANNEL_LABELS[rule.channel] ?? rule.channel}</span>
                        {" · "}
                        {languageLabel}
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
                          disabled={busy === busyKey}
                          onClick={() => void (async () => {
                            setBusy(busyKey);
                            setNotice(null);
                            try {
                              for (const member of group.members) {
                                const res = await fetch(`/api/dashboard/communication/routing-rules/${member.id}`, {
                                  method: "PATCH",
                                  headers: { "content-type": "application/json" },
                                  body: JSON.stringify({ enabled: !rule.enabled }),
                                });
                                const body = await res.json().catch(() => ({}));
                                if (!res.ok) {
                                  setNotice({ tone: "error", text: body.error ?? "تعذّر تحديث مجموعة قواعد التوجيه." });
                                  await load();
                                  return;
                                }
                              }
                              await load();
                            } finally {
                              setBusy(null);
                            }
                          })()}
                          className={cn(
                            "rounded-lg border px-2 py-0.5 text-[11px] font-semibold disabled:opacity-40",
                            rule.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500",
                          )}
                        >
                          {rule.enabled ? "مفعّلة" : "معطّلة"}
                        </button>
                        <button
                          type="button"
                          disabled={busy === busyKey}
                          onClick={() => setEditingRuleId((current) => current === rule.id ? null : rule.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        >
                          <Pencil className="h-3 w-3" /> تعديل
                        </button>
                        <button
                          type="button"
                          disabled={busy === busyKey}
                          onClick={() => void removeRuleGroup(group)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                        >
                          <Trash2 className="h-3 w-3" /> حذف
                        </button>
                      </div>
                      {editingRuleId === rule.id && (
                        <div className="basis-full border-t border-slate-100 pt-3">
                          <RuleForm
                            senders={data.senders}
                            rule={rule}
                            ruleGroup={group.members}
                            onCancel={() => setEditingRuleId(null)}
                            onDone={async () => { setEditingRuleId(null); await load(); }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}          </div>

          <RoutingPreview />
        </div>
      )}
    </section>
  );
}

/** Compact searchable multi-select used for the 19 supported site languages. */
function LanguageMultiSelect({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase();
  const options = SUPPORTED_LANGUAGES.filter(([code, label]) =>
    !normalized || code.toLowerCase().includes(normalized) || label.toLocaleLowerCase().includes(normalized)
  );
  const selectedLabels = SUPPORTED_LANGUAGES.filter(([code]) => value.includes(code)).map(([, label]) => label);
  const summary = selectedLabels.length === 0
    ? "كل اللغات"
    : selectedLabels.length <= 3
      ? selectedLabels.join("، ")
      : `${selectedLabels.slice(0, 3).join("، ")} +${selectedLabels.length - 3}`;

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:border-slate-300"
      >
        <span className={value.length ? "text-slate-800" : "text-slate-500"}>{summary}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[280px] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث عن لغة أو كود..."
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mt-2 max-h-64 overflow-y-auto">
            {options.map(([code, label]) => {
              const selected = value.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => onChange(selected ? value.filter((item) => item !== code) : [...value, code])}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span>{label} <span className="ms-1 text-xs text-slate-400">{code}</span></span>
                  <span className={cn(
                    "flex h-4 w-4 items-center justify-center rounded border",
                    selected ? "border-brand bg-brand text-white" : "border-slate-300 bg-white"
                  )}>
                    {selected && <Check className="h-3 w-3" />}
                  </span>
                </button>
              );
            })}
            {options.length === 0 && <p className="px-2 py-3 text-center text-xs text-slate-400">لا توجد نتائج.</p>}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <button type="button" onClick={() => onChange([])} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
              مسح الكل = كل اللغات
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
              تم
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Create or edit a sender. Channel/provider stay immutable once the sender exists. */
function SenderForm({
  sender,
  metaAssets,
  onDone,
  onCancel,
}: {
  sender?: Sender;
  metaAssets: MetaAssetsPayload | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const editing = Boolean(sender);
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>((sender?.channel as (typeof CHANNELS)[number]) ?? "WHATSAPP");
  const [form, setForm] = useState({
    name: sender?.name ?? "",
    displayName: sender?.displayName ?? "",
    phoneNumberId: sender?.phoneNumberId ?? "",
    displayPhoneNumber: sender?.displayPhoneNumber ?? "",
    businessAccountId: sender?.businessAccountId ?? "",
    senderEmail: sender?.senderEmail ?? "",
    smsSender: sender?.smsSender ?? "",
    supportedCountries: sender?.supportedCountries.join(", ") ?? "",
    priority: String(sender?.priority ?? 100),
  });
  const [locales, setLocales] = useState<string[]>(sender?.supportedLocales ?? []);
  const [purposes, setPurposes] = useState<string[]>(sender?.supportedPurposes ?? []);
  const selectedWaba = metaAssets?.wabas.find((waba) => waba.id === form.businessAccountId) ?? null;
  const selectedPhone = selectedWaba?.phones.find((phone) => phone.id === form.phoneNumberId) ?? null;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const list = (value: string) => value.split(",").map((v) => v.trim()).filter(Boolean);
      const editable = {
        name: form.name.trim(),
        displayName: form.displayName.trim() || null,
        phoneNumberId: channel === "WHATSAPP" ? form.phoneNumberId.trim() || null : null,
        displayPhoneNumber: channel === "WHATSAPP" ? form.displayPhoneNumber.trim() || null : null,
        businessAccountId: channel === "WHATSAPP" ? form.businessAccountId.trim() || null : null,
        senderEmail: channel === "EMAIL" ? form.senderEmail.trim() || null : null,
        smsSender: channel === "SMS" ? form.smsSender.trim() || null : null,
        supportedLocales: locales,
        supportedCountries: list(form.supportedCountries).map((country) => country.toUpperCase()),
        supportedPurposes: purposes,
        priority: Number(form.priority) || 100,
      };
      const payload = editing
        ? editable
        : {
            ...editable,
            channel,
            provider: channel === "WHATSAPP" ? "META_WHATSAPP" : channel === "EMAIL" ? "ELASTIC_EMAIL" : "NETGSM_SMS",
            status: channel === "WHATSAPP" ? "NOT_CONFIGURED" : "ACTIVE",
            enabled: channel === "WHATSAPP" ? false : true,
          };

      const res = await fetch(
        editing ? `/api/dashboard/communication/senders/${sender!.id}` : "/api/dashboard/communication/senders",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? (editing ? "تعذّر حفظ التعديلات." : "تعذّر إنشاء المُرسِل."));
        return;
      }
      await onDone();
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400";
  const missingWhatsappIdentity = channel === "WHATSAPP" &&
    (!form.phoneNumberId.trim() || !form.businessAccountId.trim() || !form.displayPhoneNumber.trim());

  return (
    <div className={cn(
      "rounded-xl border p-4",
      editing ? "border-slate-200 bg-slate-50/70" : "mb-5 border-brand/20 bg-brand/5"
    )}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900">{editing ? "تعديل المُرسِل" : "إضافة مُرسِل جديد"}</p>
          {editing && <p className="mt-0.5 text-xs text-slate-500">القناة والمزوّد ثابتان حفاظًا على سجل الرسائل والتوجيه.</p>}
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="إغلاق">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-semibold text-slate-600">
          القناة
          <select
            value={channel}
            disabled={editing}
            onChange={(e) => setChannel(e.target.value as typeof channel)}
            className={cn(field, "mt-1 disabled:bg-slate-100 disabled:text-slate-500")}
          >
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
            {metaAssets ? (
              <>
                <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-xs font-semibold text-emerald-800">
                    حساب الأعمال الرئيسي: {metaAssets.businessPortfolio.name || "Meta Business Portfolio"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-emerald-700" dir="ltr">
                    Business Portfolio ID: {metaAssets.businessPortfolio.id}
                  </p>
                </div>
                <label className="text-xs font-semibold text-slate-600">
                  حساب WhatsApp Business (WABA)
                  <select
                    value={form.businessAccountId}
                    onChange={(event) => {
                      const businessAccountId = event.target.value;
                      const waba = metaAssets.wabas.find((item) => item.id === businessAccountId);
                      const firstPhone = waba?.phones[0];
                      setForm((previous) => ({
                        ...previous,
                        businessAccountId,
                        phoneNumberId: firstPhone?.id ?? "",
                        displayPhoneNumber: firstPhone?.displayPhoneNumber ?? "",
                        displayName: previous.displayName || firstPhone?.verifiedName || "",
                      }));
                    }}
                    className={cn(field, "mt-1")}
                  >
                    <option value="">اختر WABA من حساب الأعمال الرئيسي…</option>
                    {metaAssets.wabas.map((waba) => (
                      <option key={waba.id} value={waba.id}>
                        {waba.name || waba.id} — {waba.relationship === "OWNED" ? "مملوك" : "مشارك"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  رقم واتساب من WABA
                  <select
                    value={form.phoneNumberId}
                    disabled={!selectedWaba}
                    onChange={(event) => {
                      const phoneNumberId = event.target.value;
                      const phone = selectedWaba?.phones.find((item) => item.id === phoneNumberId);
                      setForm((previous) => ({
                        ...previous,
                        phoneNumberId,
                        displayPhoneNumber: phone?.displayPhoneNumber ?? "",
                        displayName: previous.displayName || phone?.verifiedName || "",
                      }));
                    }}
                    className={cn(field, "mt-1 disabled:bg-slate-100")}
                  >
                    <option value="">اختر الرقم…</option>
                    {(selectedWaba?.phones ?? []).map((phone) => (
                      <option key={phone.id} value={phone.id}>
                        {phone.displayPhoneNumber || phone.id}{phone.verifiedName ? ` — ${phone.verifiedName}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  الرقم كما يظهر
                  <input value={form.displayPhoneNumber} readOnly className={cn(field, "mt-1 bg-slate-100")} />
                </label>
                {selectedPhone?.qualityRating && (
                  <p className="text-[11px] text-slate-500 sm:col-span-2 lg:col-span-3">
                    جودة الرقم في Meta: <span className="font-semibold">{selectedPhone.qualityRating}</span>
                  </p>
                )}
              </>
            ) : (
              <>
                <label className="text-xs font-semibold text-slate-600">
                  Phone Number ID في Meta
                  <input inputMode="numeric" value={form.phoneNumberId} onChange={set("phoneNumberId")} className={cn(field, "mt-1")} />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  الرقم كما يظهر
                  <input value={form.displayPhoneNumber} onChange={set("displayPhoneNumber")} placeholder="+90…" className={cn(field, "mt-1")} />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  WABA ID
                  <input inputMode="numeric" value={form.businessAccountId} onChange={set("businessAccountId")} className={cn(field, "mt-1")} />
                </label>
                <p className="text-[11px] text-amber-700 sm:col-span-2 lg:col-span-3">
                  لم يتم اكتشاف أصول Meta تلقائيًا. أكمل إعداد Business Portfolio المركزي ثم أعد تحميل الصفحة.
                </p>
              </>
            )}
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

        <div className="text-xs font-semibold text-slate-600 sm:col-span-2 lg:col-span-2">
          <p className="mb-1">اللغات المدعومة <span className="font-normal text-slate-400">(لا اختيار = كل اللغات)</span></p>
          <LanguageMultiSelect value={locales} onChange={setLocales} />
        </div>
        <label className="text-xs font-semibold text-slate-600">
          الدول المدعومة (فراغ = الكل)
          <input value={form.supportedCountries} onChange={set("supportedCountries")} placeholder="TR, SA" className={cn(field, "mt-1")} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          الأولوية (الأصغر أولًا)
          <input inputMode="numeric" value={form.priority} onChange={set("priority")} className={cn(field, "mt-1")} />
        </label>
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold text-slate-600">الأغراض المدعومة (بدون اختيار = الكل)</p>
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

      {missingWhatsappIdentity && (
        <p className="mt-2 text-xs text-amber-700">رقم واتساب يحتاج Phone Number ID وWABA ID والرقم الظاهر قبل الحفظ.</p>
      )}
      {error && <p className="mt-2 text-xs font-medium text-rose-700">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || !form.name.trim() || missingWhatsappIdentity}
          onClick={() => void submit()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editing ? "حفظ التعديلات" : "حفظ المُرسِل"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}

function RuleForm({
  senders,
  rule,
  ruleGroup,
  onDone,
  onCancel,
}: {
  senders: Sender[];
  rule?: Rule;
  ruleGroup?: Rule[];
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const editing = Boolean(rule);
  const initialMembers = ruleGroup?.length ? ruleGroup : rule ? [rule] : [];
  const initialLocales = initialMembers.some((member) => !member.locale)
    ? []
    : initialMembers.map((member) => member.locale!).sort();
  const [form, setForm] = useState({
    channel: rule?.channel ?? "WHATSAPP",
    locales: initialLocales as string[],
    country: rule?.country ?? "",
    purpose: rule?.purpose ?? "",
    senderId: rule?.senderId ?? "",
    fallbackSenderId: rule?.fallbackSenderId ?? "",
    priority: String(rule?.priority ?? 100),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = senders.filter((s) => s.channel === form.channel);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const locales = form.locales.length ? form.locales : [null];
      const basePayload = {
        country: form.country.trim().toUpperCase() || null,
        purpose: form.purpose || null,
        senderId: form.senderId,
        fallbackSenderId: form.fallbackSenderId || null,
        priority: Number(form.priority) || 100,
      };

      if (editing) {
        const members = ruleGroup?.length ? ruleGroup : [rule!];
        const keyFor = (locale: string | null) => locale ?? "__any__";
        const desiredKeys = new Set(locales.map(keyFor));
        const currentByLocale = new Map(members.map((member) => [keyFor(member.locale), member]));

        // Keep existing locale rows whenever possible. This avoids converting one row into a locale
        // already occupied by its sibling, which the server correctly treats as a routing conflict.
        for (const locale of locales) {
          const existing = currentByLocale.get(keyFor(locale));
          if (existing) {
            const update = await fetch(`/api/dashboard/communication/routing-rules/${existing.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(basePayload),
            });
            const updateBody = await update.json().catch(() => ({}));
            if (!update.ok) {
              setError(updateBody.error ?? `تعذّر تحديث قاعدة اللغة ${locale ?? "العامة"}.`);
              return;
            }
            continue;
          }

          const create = await fetch("/api/dashboard/communication/routing-rules", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ...basePayload,
              channel: form.channel,
              locale,
              enabled: rule?.enabled ?? true,
            }),
          });
          const createBody = await create.json().catch(() => ({}));
          if (!create.ok) {
            setError(createBody.error ?? `تعذّر إنشاء قاعدة اللغة ${locale ?? "العامة"}.`);
            return;
          }
        }

        // Removing a language from the multi-select now removes its stored sibling row too. Before
        // this, an old locale silently survived and continued routing traffic after the operator had
        // visibly removed it from the editor.
        for (const member of members) {
          if (desiredKeys.has(keyFor(member.locale))) continue;
          const remove = await fetch(`/api/dashboard/communication/routing-rules/${member.id}`, { method: "DELETE" });
          const removeBody = await remove.json().catch(() => ({}));
          if (!remove.ok) {
            setError(removeBody.error ?? `حُفظت اللغات الجديدة لكن تعذّر حذف قاعدة اللغة ${member.locale ?? "العامة"}.`);
            return;
          }
        }
      } else {
        for (const locale of locales) {
          const create = await fetch("/api/dashboard/communication/routing-rules", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ...basePayload,
              channel: form.channel,
              locale,
              enabled: true,
            }),
          });
          const createBody = await create.json().catch(() => ({}));
          if (!create.ok) {
            setError(createBody.error ?? `تعذّر إنشاء قاعدة اللغة ${locale ?? "العامة"}.`);
            return;
          }
        }
      }

      await onDone();
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800";

  return (
    <div className={cn("p-4", editing ? "rounded-xl border border-slate-200 bg-slate-50/70" : "border-b border-slate-100 bg-slate-50/60")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">{editing ? "تعديل قاعدة التوجيه" : "إضافة قاعدة توجيه"}</p>
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="إغلاق">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold text-slate-600">
          القناة
          <select
            value={form.channel}
            disabled={editing}
            onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value, senderId: "", fallbackSenderId: "" }))}
            className={cn(field, "mt-1 disabled:bg-slate-100 disabled:text-slate-500")}
          >
            {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          اللغات (بدون اختيار = أي لغة)
          <div className="mt-1">
            <LanguageMultiSelect
              value={form.locales}
              onChange={(locales) => setForm((f) => ({ ...f, locales }))}
            />
          </div>
          <span className="mt-1 block text-[10px] font-normal text-slate-400">
            تُعرض اللغات كقاعدة واحدة، ويحافظ النظام داخليًا على صف مستقل لكل لغة لضمان توجيه دقيق.
          </span>
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
          <input inputMode="numeric" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={cn(field, "mt-1")} />
        </label>
      </div>
      {error && <p className="mt-2 text-xs font-medium text-rose-700">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || !form.senderId}
          onClick={() => void submit()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editing ? "حفظ التعديلات" : "حفظ القاعدة"}
        </button>
        <button type="button" disabled={saving} onClick={onCancel} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          إلغاء
        </button>
      </div>
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
        <select value={form.locale} onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))} className={cn(field, "min-w-40")}>
          <option value="">أي لغة</option>
          {SUPPORTED_LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label} — {code}</option>)}
        </select>
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
