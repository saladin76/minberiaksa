"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Save } from "lucide-react";
import {
  DEFAULT_SUGGESTED_TEAM_SUPPORT_AMOUNTS,
  parseSuggestedTeamSupport,
  type SuggestedTeamSupportConfig,
} from "@/lib/campaign/suggested-team-support";
import {
  SuggestedTeamSupportSection,
  type SuggestedTeamSupportSectionRef,
} from "../_components/SuggestedTeamSupportSection";

export default function TeamSupportDefaultsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seed, setSeed] = useState<SuggestedTeamSupportConfig | undefined>(
    undefined
  );
  const sectionRef = useRef<SuggestedTeamSupportSectionRef>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axios
      .get("/api/global-settings")
      .then((res) => {
        if (cancelled) return;
        setSeed(parseSuggestedTeamSupport(res.data?.suggestedTeamSupport));
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
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          القيم الافتراضية لدعم الفريق
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          هذه القيم تظهر للمتبرعين في خطوة &quot;دعم الفريق&quot; داخل نموذج
          التبرع وسلة المشتريات، وتنطبق على جميع الحملات التي لم تُحدّد قيمًا
          خاصة بها. زر &quot;لا شكراً&quot; يظهر تلقائيًا ولا يلزم إضافته.
        </p>
      </div>

      <Card className="p-5 sm:p-6">
        {loading || seed === undefined ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">جاري التحميل...</span>
          </div>
        ) : (
          <>
            <SuggestedTeamSupportSection
              ref={sectionRef}
              initialConfig={seed}
              label="القيم الافتراضية (جميع العملات)"
              helpText="أرقام مفصولة بفاصلة أو مسافة. تُستخدم لكل العملات ما لم تُضف استثناءً أدناه. اتركها فارغة لاستخدام القيم المبدئية للنظام."
              defaultPlaceholder={DEFAULT_SUGGESTED_TEAM_SUPPORT_AMOUNTS.join(
                ", "
              )}
              exceptionsLabel="استثناءات حسب العملة (اختياري)"
              exceptionsEmptyHint="بدون استثناءات، تُطبّق القيم أعلاه على جميع العملات."
            />

            <div className="flex justify-end mt-6">
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="gap-2 bg-brand hover:bg-brand-dark text-white"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                حفظ
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
