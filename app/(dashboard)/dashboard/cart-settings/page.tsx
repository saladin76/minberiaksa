"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Loader2, Plus, Save, Trash2 } from "lucide-react";
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
} from "../campaigns/_components/SuggestedTeamSupportSection";

/**
 * The basket's own settings — what the cart page shows around the rows the
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

/** Every campaign, active or not — an admin may pre-list one about to launch. */
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
  /** Ids already used by other rows — hidden so a campaign is listed once. */
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
            {selected ? `${selected.title}${selected.isActive ? "" : " (غير نشط)"}` : loading ? "جاري تحميل المشاريع..." : "اختر مشروعًا"}
          </span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="ابحث عن مشروع..." />
          <CommandList>
            <CommandEmpty>لا يوجد مشروع بهذا الاسم</CommandEmpty>
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
                    {c.isActive ? null : <span className="ms-auto text-xs text-muted-foreground">غير نشط</span>}
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axios
      .get("/api/global-settings")
      .then((res) => {
        if (cancelled) return;
        setSeed(parseSuggestedTeamSupport(res.data?.suggestedTeamSupport));
        setEnabled(res.data?.teamSupportEnabled !== false);
        setUpsell(parseCartUpsell(res.data?.cartUpsell).items.map((item) => makeRow(item)));
      })
      .catch(() => {
        if (cancelled) return;
        setSeed(parseSuggestedTeamSupport(null));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setRowCampaign = (key: string, campaignId: string) =>
    setUpsell((rows) => rows.map((r) => (r.key === key ? { ...r, campaignId } : r)));
  const removeRow = (key: string) => {
    rowRefs.current.delete(key);
    setUpsell((rows) => rows.filter((r) => r.key !== key));
  };
  const addRow = () => setUpsell((rows) => (rows.length >= CART_UPSELL_MAX_ITEMS ? rows : [...rows, makeRow()]));

  const handleSave = async () => {
    if (!sectionRef.current) return;
    const items: Array<{ campaignId: string; amounts: number[]; byCurrency: Record<string, number[]> }> = [];
    for (const row of upsell) {
      if (!row.campaignId) {
        toast.error("اختر مشروعًا لكل اقتراح أو احذف الصف الفارغ");
        return;
      }
      const payload = rowRefs.current.get(row.key)?.getPayload();
      if (!payload || !payload.amounts.length) {
        toast.error(`أدخل مبلغًا واحدًا على الأقل لمشروع «${campaignTitle.get(row.campaignId) ?? ""}»`);
        return;
      }
      items.push({ campaignId: row.campaignId, amounts: payload.amounts, byCurrency: payload.byCurrency });
    }
    setSaving(true);
    try {
      await axios.put("/api/global-settings", {
        teamSupportEnabled: enabled,
        suggestedTeamSupport: sectionRef.current.getPayload(),
        cartUpsell: { items },
      });
      toast.success("تم حفظ الإعدادات");
    } catch (e) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.error ? String(e.response.data.error) : "تعذّر حفظ الإعدادات";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const chosen = new Set(upsell.map((r) => r.campaignId));

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">إعدادات السلة</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          ما تعرضه صفحة السلة حول التبرعات التي اختارها المتبرع: خطوة دعم الفريق قبل إتمام الدفع، والمشاريع
          المقترحة في قسم «وسِّع أثر عطاءك». كلاهما ينطبق على السلة كلها لا على مشروع بعينه.
        </p>
      </div>

      {loading || seed === undefined ? (
        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">جاري التحميل...</span>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-5 sm:p-6 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">دعم الفريق</h2>
              <p className="text-sm text-muted-foreground mt-1">
                إذا كانت السلة تحتوي على تبرع دوري يُخصم مبلغ الدعم مع كل دورة افتراضيًا، ويمكن للمتبرع اختيار
                خصمه مرة واحدة. إذا كانت كل التبرعات لمرة واحدة يُخصم مرة واحدة.
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <Label htmlFor="team-support-enabled" className="text-base">إظهار خطوة دعم الفريق في السلة</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  عند الإيقاف لا تظهر الخطوة للمتبرعين ولا يُضاف أي مبلغ دعم إلى الطلبات، حتى لو أُرسل من المتصفح.
                </p>
              </div>
              <Switch id="team-support-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <SuggestedTeamSupportSection
              ref={sectionRef}
              initialConfig={seed}
              label="المبالغ المقترحة (جميع العملات)"
              helpText="أرقام مفصولة بفاصلة أو مسافة. تُستخدم لكل العملات ما لم تُضف استثناءً أدناه. اتركها فارغة لاستخدام القيم المبدئية للنظام. زر «لا شكراً» يظهر تلقائيًا."
              defaultPlaceholder={DEFAULT_SUGGESTED_TEAM_SUPPORT_AMOUNTS.join(", ")}
              exceptionsLabel="استثناءات حسب العملة (اختياري)"
              exceptionsEmptyHint="بدون استثناءات، تُطبّق القيم أعلاه على جميع العملات."
            />
          </Card>

          <Card className="p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-slate-900">وسِّع أثر عطاءك — المشاريع المقترحة</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  تظهر تحت تبرعات السلة مع أزرار مبالغ سريعة بعملة المتبرع. بدون مشاريع هنا تُعرض الاقتراحات
                  العامة للموقع. الحد الأقصى {CART_UPSELL_MAX_ITEMS} مشاريع.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={upsell.length >= CART_UPSELL_MAX_ITEMS} className="gap-1">
                <Plus className="w-4 h-4" />
                إضافة مشروع
              </Button>
            </div>

            {upsell.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا مشاريع مختارة — تُعرض الاقتراحات العامة.</p>
            ) : (
              <div className="space-y-4">
                {upsell.map((row, index) => (
                  <div key={row.key} className="space-y-4 border rounded-lg p-4">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 min-w-0">
                        <Label className="text-xs text-muted-foreground">المشروع {index + 1}</Label>
                        <CampaignPicker
                          value={row.campaignId}
                          options={campaigns}
                          taken={chosen}
                          loading={campaignsLoading}
                          onChange={(id) => setRowCampaign(row.key, id)}
                        />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={() => removeRow(row.key)} aria-label="حذف المشروع">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <SuggestedTeamSupportSection
                      ref={(instance) => {
                        rowRefs.current.set(row.key, instance);
                      }}
                      initialConfig={row.seed}
                      label="المبالغ المقترحة (جميع العملات)"
                      helpText="أرقام مفصولة بفاصلة أو مسافة. تُستخدم لكل العملات ما لم تُضف استثناءً أدناه."
                      defaultPlaceholder={DEFAULT_CART_UPSELL_AMOUNTS.join(", ")}
                      exceptionsLabel="استثناءات حسب العملة (اختياري)"
                      exceptionsEmptyHint="بدون استثناءات، تُطبّق القيم أعلاه على جميع العملات."
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="flex justify-end">
            <Button type="button" onClick={handleSave} disabled={saving} className="gap-2 bg-brand hover:bg-brand-dark text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
