"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";
import {
  DEFAULT_SUGGESTED_TEAM_SUPPORT_AMOUNTS,
  parseSuggestedTeamSupport,
  type SuggestedTeamSupportConfig,
} from "@/lib/campaign/suggested-team-support";
import {
  SuggestedTeamSupportSection,
  type SuggestedTeamSupportSectionRef,
} from "../campaigns/_components/SuggestedTeamSupportSection";

/**
 * "Support the team" — the step the basket shows once, before checkout, for
 * the whole order. It is not a per-campaign setting any more: this page holds
 * the switch that shows or hides the step and the quick-pick amounts it
 * offers (with per-currency exceptions). Both live on `GlobalSettings`.
 */
export default function TeamSupportPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [seed, setSeed] = useState<SuggestedTeamSupportConfig | undefined>(undefined);
  const sectionRef = useRef<SuggestedTeamSupportSectionRef>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axios
      .get("/api/global-settings")
      .then((res) => {
        if (cancelled) return;
        setSeed(parseSuggestedTeamSupport(res.data?.suggestedTeamSupport));
        setEnabled(res.data?.teamSupportEnabled !== false);
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

  const handleSave = async () => {
    if (!sectionRef.current) return;
    setSaving(true);
    try {
      const payload = sectionRef.current.getPayload();
      await axios.put("/api/global-settings", {
        teamSupportEnabled: enabled,
        suggestedTeamSupport: payload,
      });
      toast.success("تم حفظ الإعدادات");
    } catch (e) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.error
          ? String(e.response.data.error)
          : "تعذّر حفظ الإعدادات";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">دعم الفريق</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          تظهر خطوة &quot;دعم الفريق&quot; للمتبرع مرة واحدة في السلة قبل إتمام الدفع، وتنطبق على
          الطلب كله لا على مشروع بعينه. إذا كانت السلة تحتوي على تبرع دوري يُخصم مبلغ الدعم مع كل
          دورة، وإذا كانت كل التبرعات لمرة واحدة يُخصم مرة واحدة.
        </p>
      </div>

      <Card className="p-5 sm:p-6">
        {loading || seed === undefined ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">جاري التحميل...</span>
          </div>
        ) : (
          <div className="space-y-6">
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

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="gap-2 bg-brand hover:bg-brand-dark text-white"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                حفظ
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
