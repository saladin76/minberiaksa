"use client";

import { Bot } from "lucide-react";
import { ConciergeShell } from "../_components/ConciergeShell";
import { SettingsView } from "../_components/SettingsView";
import { dt } from "@/lib/dashboard/i18n";

/** مساعد العطاء  switches: visibility, teaser, model, transcripts, attribution, team notes. */
export default function AiConciergeSettingsPage() {
  return (
    <ConciergeShell
      title={dt("إعدادات مساعد العطاء")}
      icon={Bot}
      description={dt("تحكّم في ظهور المساعد في الموقع، استخدام الذكاء الاصطناعي، حفظ المحادثات، طريقة نسب التبرعات، وما يعرفه المساعد.")}
    >
      <SettingsView />
    </ConciergeShell>
  );
}
