"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { useDashboardUnsavedChanges } from "@/hooks/useDashboardUnsavedChanges";
import { SUPPORTED_CURRENCY_OPTIONS } from "@/lib/supported-currencies";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Loader2, Plus, Save, Trash2, ArrowUp, ArrowDown, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SUGGESTED_TEAM_SUPPORT_AMOUNTS,
  parseSuggestedTeamSupport,
  type SuggestedTeamSupportConfig,
} from "@/lib/campaign/suggested-team-support";
import {
  CART_UPSELL_MAX_ITEMS,
  DEFAULT_CART_UPSELL_AMOUNTS,
  parseCartUpsell,
  type CartUpsellItem,
} from "@/lib/minbar/cart-upsell";
import {
  SuggestedTeamSupportSection,
  type SuggestedTeamSupportSectionRef,
  type SuggestedTeamSupportPayload,
} from "../campaigns/_components/SuggestedTeamSupportSection";
import { dashDir, dt, dtx } from "@/lib/dashboard/i18n";

/**
 * The basket's own settings  what the cart page shows around the rows the
 * donor put there, none of it per campaign:
 *
 *  - "Support the team": the switch that shows or hides the step, and the
 *    quick-pick amounts it offers (with per-currency exceptions).
 *  - "وسِّع أثر عطاءك": the campaigns suggested under the rows, each with its
 *    own quick-pick amounts and per-currency exceptions. Empty falls back to
 *    the site's generic suggestions.
 *
 * Both live on `GlobalSettings`.
 */

type CampaignOption = { id: string; title: string; isActive: boolean };

/** Every campaign, active or not  an admin may pre-list one about to launch. */
function useCampaignOptions() {
  const [options, setOptions] = useState<CampaignOption[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    (async () => {
      const out: CampaignOption[] = [];
      for (let page = 1; page <= 5; page++) {
        try {
          const res = await axios.get("/api/campaigns", { params: { limit: 100, page, includeInactive: true } });
          const items = (res.data?.items ?? []) as CampaignOption[];
          out.push(...items.map((c) => ({ id: c.id, title: c.title, isActive: c.isActive !== false })));
          if (!res.data?.hasMore) break;
        } catch {
          break;
        }
      }
      if (live) {
        setOptions(out);
        setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return { options, loading };
}

/** A searchable campaign picker: typing filters the list by title. */
function CampaignPicker({
  value,
  options,
  taken,
  loading,
  onChange,
}: {
  value: string;
  options: CampaignOption[];
  /** Ids already used by other rows  hidden so a campaign is listed once. */
  taken: Set<string>;
  loading: boolean;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((c) => c.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between mt-1 font-normal">
          <span className="truncate">
            {selected ? `${selected.title}${selected.isActive ? "" : dt(" (غير نشط)")}` : loading ? dt("جاري تحميل المشاريع...") : dt("اختر مشروعًا")}
          </span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={dt("ابحث عن مشروع...")} />
          <CommandList>
            <CommandEmpty>{dt("لا يوجد مشروع بهذا الاسم")}</CommandEmpty>
            <CommandGroup>
              {options
                .filter((c) => c.id === value || !taken.has(c.id))
                .map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.title} ${c.id}`}
                    onSelect={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("me-2 h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{c.title}</span>
                    {c.isActive ? null : <span className="ms-auto text-xs text-muted-foreground">{dt("غير نشط")}</span>}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type UpsellRow = { key: string; campaignId: string; seed: SuggestedTeamSupportConfig };

function makeRow(item?: CartUpsellItem): UpsellRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    campaignId: item?.campaignId ?? "",
    seed: item ? { amounts: item.amounts, byCurrency: item.byCurrency } : { amounts: [...DEFAULT_CART_UPSELL_AMOUNTS], byCurrency: {} },
  };
}

export default function CartSettingsPage() {
  const [loadError, setLoadError] = useState("");
  const [baseline, setBaseline] = useState("");
  const [saved, setSaved] = useState(false);
  const [previewCurrency, setPreviewCurrency] = useState("USD");
  const [supportDraft, setSupportDraft] = useState<SuggestedTeamSupportPayload | null | undefined>(undefined);
  const [rowDrafts, setRowDrafts] = useState<Record<string, SuggestedTeamSupportPayload | null>>({});
  const [loadEpoch, setLoadEpoch] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [seed, setSeed] = useState<SuggestedTeamSupportConfig | undefined>(undefined);
  const [upsell, setUpsell] = useState<UpsellRow[]>([]);
  const sectionRef = useRef<SuggestedTeamSupportSectionRef>(null);
  /* One amounts section per suggestion row, read on save. */
  const rowRefs = useRef(new Map<string, SuggestedTeamSupportSectionRef | null>());
  const { options: campaigns, loading: campaignsLoading } = useCampaignOptions();
  const campaignTitle = useMemo(() => new Map(campaigns.map((c) => [c.id, c.title])), [campaigns]);

  const payloadSnapshot = (settings: { teamSupportEnabled: boolean; suggestedTeamSupport: unknown; cartUpsell: unknown }) => JSON.stringify({ teamSupportEnabled: settings.teamSupportEnabled, suggestedTeamSupport: parseSuggestedTeamSupport(settings.suggestedTeamSupport), cartUpsell: parseCartUpsell(settings.cartUpsell) });
  const currentSettings = { teamSupportEnabled: enabled, suggestedTeamSupport: supportDraft === undefined ? seed : supportDraft, cartUpsell: { items: upsell.map(row => ({ campaignId: row.campaignId, ...(rowDrafts[row.key] === undefined ? row.seed : rowDrafts[row.key] || { amounts: [], byCurrency: {} }) })) } };
  const dirty = Boolean(baseline && payloadSnapshot(currentSettings) !== baseline);
  useDashboardUnsavedChanges(dirty);
  const onSupportChange = useCallback((payload: SuggestedTeamSupportPayload | null) => setSupportDraft(payload), []);
  const previewSupport = parseSuggestedTeamSupport(currentSettings.suggestedTeamSupport);
  const supportAmounts = previewSupport.byCurrency[previewCurrency]?.length ? previewSupport.byCurrency[previewCurrency] : previewSupport.amounts.length ? previewSupport.amounts : DEFAULT_SUGGESTED_TEAM_SUPPORT_AMOUNTS;
  useEffect(() => { if (!saved) return; const timer = setTimeout(() => setSaved(false), 6500); return () => clearTimeout(timer); }, [saved]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError("");
    axios
      .get("/api/global-settings")
      .then((res) => {
        if (cancelled) return;
        setBaseline(payloadSnapshot({ teamSupportEnabled: res.data?.teamSupportEnabled !== false, suggestedTeamSupport: res.data?.suggestedTeamSupport, cartUpsell: res.data?.cartUpsell }));
        setSupportDraft(undefined); setRowDrafts({});
        setSeed(parseSuggestedTeamSupport(res.data?.suggestedTeamSupport));
        setEnabled(res.data?.teamSupportEnabled !== false);
        setUpsell(parseCartUpsell(res.data?.cartUpsell).items.map((item) => makeRow(item)));
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(dt("تعذر تحميل إعدادات السلة. أعد المحاولة قبل التعديل أو الحفظ."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadEpoch]);

  const setRowCampaign = (key: string, campaignId: string) =>
    setUpsell((rows) => rows.map((r) => (r.key === key ? { ...r, campaignId } : r)));
  const removeRow = (key: string) => {
    rowRefs.current.delete(key);
    setUpsell((rows) => rows.filter((r) => r.key !== key));
  };
  const addRow = () => setUpsell((rows) => (rows.length >= CART_UPSELL_MAX_ITEMS ? rows : [...rows, makeRow()]));

  const handleSave = async () => {
    if (!sectionRef.current || loadError || saving) return;
    const items: Array<{ campaignId: string; amounts: number[]; byCurrency: Record<string, number[]> }> = [];
    for (const row of upsell) {
      if (!row.campaignId) {
        toast.error(dt("اختر مشروعًا لكل اقتراح أو احذف الصف الفارغ"));
        return;
      }
      const payload = rowRefs.current.get(row.key)?.getPayload();
      if (!payload || !payload.amounts.length) {
        toast.error(dt("أدخل مبلغًا واحدًا على الأقل لمشروع «{0}»", [campaignTitle.get(row.campaignId) ?? ""]));
        return;
      }
      items.push({ campaignId: row.campaignId, amounts: payload.amounts, byCurrency: payload.byCurrency });
    }
    setSaving(true);
    try {
      const payload = {
        teamSupportEnabled: enabled,
        suggestedTeamSupport: sectionRef.current.getPayload(),
        cartUpsell: { items },
      };
      await axios.put("/api/global-settings", payload);
      const verified = await axios.get("/api/global-settings", { headers: { "Cache-Control": "no-cache" } });
      if (payloadSnapshot({ teamSupportEnabled: verified.data?.teamSupportEnabled !== false, suggestedTeamSupport: verified.data?.suggestedTeamSupport, cartUpsell: verified.data?.cartUpsell }) !== payloadSnapshot(payload)) throw new Error(dt("تعذر تأكيد الإعدادات المحفوظة؛ احتفظ بالتعديلات وأعد التحميل للمراجعة."));
      setBaseline(payloadSnapshot(payload)); setSaved(true);
      toast.success(dt("تم حفظ الإعدادات"));
    } catch (e) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.error ? String(e.response.data.error) : e instanceof Error ? e.message : dt("تعذّر حفظ الإعدادات");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const chosen = new Set(upsell.map((r) => r.campaignId));

  return (
    <div className="space-y-6" dir={dashDir()}>
      <div className="sticky top-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white/95 p-4 shadow-sm backdrop-blur"><div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{dt("إعدادات السلة")}</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          {dt("ما تعرضه صفحة السلة حول التبرعات التي اختارها المتبرع: خطوة دعم الفريق قبل إتمام الدفع، والمشاريع المقترحة في قسم «وسِّع أثر عطاءك». كلاهما ينطبق على السلة كلها لا على مشروع بعينه.")}</p>
      </div><Button type="button" onClick={handleSave} disabled={saving || loading || !!loadError || !dirty} className="gap-2 bg-brand text-white">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? dt("جار الحفظ…") : saved && !dirty ? dt("تم الحفظ") : dt("حفظ التغييرات")}</Button></div>

      {loadError ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}<Button type="button" variant="outline" onClick={() => setLoadEpoch(value => value + 1)} className="ms-3">{dt("إعادة المحاولة")}</Button></div> : null}
      {saved && !dirty ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{dt("تم الحفظ والتحقق من النسخة المحفوظة")}</p> : null}
      {!loadError && (loading || seed === undefined) ? (
        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{dt("جاري التحميل...")}</span>
          </div>
        </Card>
      ) : !loadError ? (
        <>
          <Card className="p-5 sm:p-6 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{dt("دعم الفريق")}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {dt("إذا كانت السلة تحتوي على تبرع دوري يُخصم مبلغ الدعم مع كل دورة افتراضيًا، ويمكن للمتبرع اختيار خصمه مرة واحدة. إذا كانت كل التبرعات لمرة واحدة يُخصم مرة واحدة.")}</p>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <Label htmlFor="team-support-enabled" className="text-base">{dt("إظهار خطوة دعم الفريق في السلة")}</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {dt("عند الإيقاف لا تظهر الخطوة للمتبرعين ولا يُضاف أي مبلغ دعم إلى الطلبات، حتى لو أُرسل من المتصفح.")}</p>
              </div>
              <Switch id="team-support-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <SuggestedTeamSupportSection
              ref={sectionRef}
              initialConfig={seed}
              onValueChange={onSupportChange}
              label={dt("المبالغ المقترحة (جميع العملات)")}
              helpText={dt("أرقام مفصولة بفاصلة أو مسافة. تُستخدم لكل العملات ما لم تُضف استثناءً أدناه. اتركها فارغة لاستخدام القيم المبدئية للنظام. زر «لا شكراً» يظهر تلقائيًا.")}
              defaultPlaceholder={DEFAULT_SUGGESTED_TEAM_SUPPORT_AMOUNTS.join(", ")}
              exceptionsLabel={dt("استثناءات حسب العملة (اختياري)")}
              exceptionsEmptyHint={dt("بدون استثناءات، تُطبّق القيم أعلاه على جميع العملات.")}
            />
          </Card>

          <Card className="p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{dt("وسِّع أثر عطاءك  المشاريع المقترحة")}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {dtx("تظهر تحت تبرعات السلة مع أزرار مبالغ سريعة بعملة المتبرع. بدون مشاريع هنا تُعرض الاقتراحات العامة للموقع. الحد الأقصى {0} مشاريع.", [CART_UPSELL_MAX_ITEMS])}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={upsell.length >= CART_UPSELL_MAX_ITEMS} className="gap-1">
                <Plus className="w-4 h-4" />
                {dt("إضافة مشروع")}</Button>
            </div>

            {upsell.length === 0 ? (
              <p className="text-sm text-muted-foreground">{dt("لا مشاريع مختارة  تُعرض الاقتراحات العامة.")}</p>
            ) : (
              <div className="space-y-4">
                {upsell.map((row, index) => (
                  <div key={row.key} className="space-y-4 border rounded-lg p-4">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 min-w-0">
                        <Label className="text-xs text-muted-foreground">{dtx("المشروع {0}", [index + 1])}</Label>
                        <CampaignPicker
                          value={row.campaignId}
                          options={campaigns}
                          taken={chosen}
                          loading={campaignsLoading}
                          onChange={(id) => setRowCampaign(row.key, id)}
                        />
                      </div>
                      <Button type="button" variant="ghost" size="icon" disabled={index === 0} aria-label={dt("تقديم")} onClick={() => setUpsell(previous => { const next = [...previous]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}><ArrowUp size={16} /></Button>
                      <Button type="button" variant="ghost" size="icon" disabled={index === upsell.length - 1} aria-label={dt("تأخير")} onClick={() => setUpsell(previous => { const next = [...previous]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })}><ArrowDown size={16} /></Button>
                      <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={() => removeRow(row.key)} aria-label={dt("حذف المشروع")}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <SuggestedTeamSupportSection
                      ref={(instance) => {
                        rowRefs.current.set(row.key, instance);
                      }}
                      initialConfig={row.seed}
                      onValueChange={payload => setRowDrafts(previous => ({ ...previous, [row.key]: payload }))}
                      label={dt("المبالغ المقترحة (جميع العملات)")}
                      helpText={dt("أرقام مفصولة بفاصلة أو مسافة. تُستخدم لكل العملات ما لم تُضف استثناءً أدناه.")}
                      defaultPlaceholder={DEFAULT_CART_UPSELL_AMOUNTS.join(", ")}
                      exceptionsLabel={dt("استثناءات حسب العملة (اختياري)")}
                      exceptionsEmptyHint={dt("بدون استثناءات، تُطبّق القيم أعلاه على جميع العملات.")}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-4 border-brand/20 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-bold"><Eye size={18} />{dt("معاينة ما يراه المتبرع")}</h2><select aria-label={dt("عملة المعاينة")} value={previewCurrency} onChange={event => setPreviewCurrency(event.target.value)} className="rounded-lg border p-2 text-sm">{SUPPORTED_CURRENCY_OPTIONS.map(currency => <option value={currency.code} key={currency.code}>{currency.code}</option>)}</select></div>
            <div className="grid gap-4 md:grid-cols-2"><div className="rounded-xl border bg-slate-50 p-4"><h3 className="mb-3 font-semibold">{dt("دعم الفريق")}</h3>{enabled ? <div className="flex flex-wrap gap-2">{supportAmounts.map(amount => <span className="rounded-lg border bg-white px-3 py-2 text-sm" dir="ltr" key={amount}>{amount} {previewCurrency}</span>)}<span className="rounded-lg border px-3 py-2 text-sm">{dt("لا شكرًا")}</span></div> : <p className="text-sm text-slate-500">{dt("خطوة دعم الفريق مخفية")}</p>}</div><div className="space-y-2 rounded-xl border bg-slate-50 p-4"><h3 className="font-semibold">{dt("وسِّع أثر عطاءك")}</h3>{upsell.length ? upsell.map(row => { const config = parseSuggestedTeamSupport(rowDrafts[row.key] === undefined ? row.seed : rowDrafts[row.key]); const amounts = config.byCurrency[previewCurrency]?.length ? config.byCurrency[previewCurrency] : config.amounts; return <div key={row.key} className="rounded-lg border bg-white p-3"><p className="mb-2 text-sm">{campaignTitle.get(row.campaignId) || dt("اختر مشروعًا")}</p><div className="flex flex-wrap gap-2">{amounts.map(amount => <span key={amount} dir="ltr" className="rounded-md bg-brand/5 px-2 py-1 text-xs text-brand">{amount} {previewCurrency}</span>)}</div></div>; }) : <p className="text-sm text-slate-500">{dt("لا مشاريع مختارة  تُعرض الاقتراحات العامة.")}</p>}</div></div>
            <p className="text-xs leading-6 text-slate-500">{dt("المعاينة تستخدم مبالغ العملة المختارة. المشروع غير النشط أو الموجود بالفعل في السلة لا يظهر للمتبرع ضمن الاقتراحات.")}</p>
          </Card>
        </>
      ) : null}
    </div>
  );
}
