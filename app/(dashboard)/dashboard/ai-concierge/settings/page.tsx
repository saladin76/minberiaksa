"use client";

import { Bot } from "lucide-react";
import { ConciergeShell } from "../_components/ConciergeShell";
import { SettingsView } from "../_components/SettingsView";

/** مساعد العطاء  switches: visibility, teaser, model, transcripts, attribution, team notes. */
export default function AiConciergeSettingsPage() {
  return (
    <ConciergeShell
      title="إعدادات مساعد العطاء"
      icon={Bot}
      description="تحكّم في ظهور المساعد في الموقع، استخدام الذكاء الاصطناعي، حفظ المحادثات، طريقة نسب التبرعات، وما يعرفه المساعد."
    >
      <SettingsView />
    </ConciergeShell>
  );
}
