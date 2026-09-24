"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import {
  DEFAULT_SUGGESTED_TEAM_SUPPORT_AMOUNTS,
  parseAmountsInput,
  parseSuggestedTeamSupport,
  type SuggestedTeamSupportConfig,
} from "@/lib/campaign/suggested-team-support";
import {
  CART_UPSELL_MAX_AMOUNTS,
  CART_UPSELL_MAX_ITEMS,
  DEFAULT_CART_UPSELL_AMOUNTS,
  parseCartUpsell,
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
 *    own quick-pick amounts. Empty falls back to the site's generic suggestions.
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

type UpsellRow = { key: string; campaignId: string; amountsStr: string };

function makeRow(campaignId = "", amountsStr = DEFAULT_CART_UPSELL_AMOUNTS.join(", ")): UpsellRow {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, campaignId, amountsStr };
}

export default function CartSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [seed, setSeed] = useState<SuggestedTeamSupportConfig | undefined>(undefined);
  const [upsell, setUpsell] = useState<UpsellRow[]>([]);
  const sectionRef = useRef<SuggestedTeamSupportSectionRef>(null);
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
        setUpsell(parseCartUpsell(res.data?.cartUpsell).items.map((i) => makeRow(i.campaignId, i.amounts.join(", "))));
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

  const updateRow = (key: string, patch: Partial<Pick<UpsellRow, "campaignId" | "amountsStr">>) =>
    setUpsell((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) => setUpsell((rows) => rows.filter((r) => r.key !== key));
  const addRow = () => setUpsell((rows) => (rows.length >= CART_UPSELL_MAX_ITEMS ? rows : [...rows, makeRow()]));

  const handleSave = async () => {
    if (!sectionRef.current) return;
    const items = [];
    for (const row of upsell) {
      if (!row.campaignId) {
        toast.error("اختر مشروعًا لكل اقتراح أو احذف الصف الفارغ");
        return;
      }
      const amounts = parseAmountsInput(row.amountsStr).slice(0, CART_UPSELL_MAX_AMOUNTS);
      if (!amounts.length) {
        toast.error(`أدخل مبلغًا واحدًا على الأقل لمشروع «${campaignTitle.get(row.campaignId) ?? ""}»`);
        return;
      }
      items.push({ campaignId: row.campaignId, amounts });
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
              <div className="space-y-3">
                {upsell.map((row) => (
                  <div key={row.key} className="flex flex-col sm:flex-row gap-2 sm:items-end border rounded-lg p-3">
                    <div className="flex-[2] min-w-[200px]">
                      <Label className="text-xs text-muted-foreground">المشروع</Label>
                      <Select value={row.campaignId} onValueChange={(v) => updateRow(row.key, { campaignId: v })}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder={campaignsLoading ? "جاري تحميل المشاريع..." : "اختر مشروعًا"} />
                        </SelectTrigger>
                        <SelectContent>
                          {campaigns
                            .filter((c) => c.id === row.campaignId || !chosen.has(c.id))
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.title}
                                {c.isActive ? "" : " (غير نشط)"}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-[2]">
                      <Label className="text-xs text-muted-foreground">المبالغ المقترحة</Label>
                      <Input
                        className="mt-1 font-mono text-left"
                        dir="ltr"
                        value={row.amountsStr}
                        onChange={(e) => updateRow(row.key, { amountsStr: e.target.value })}
                        placeholder={DEFAULT_CART_UPSELL_AMOUNTS.join(", ")}
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={() => removeRow(row.key)} aria-label="حذف الصف">
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
