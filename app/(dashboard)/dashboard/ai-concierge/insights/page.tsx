"use client";

import { Lightbulb } from "lucide-react";
import { ConciergeShell } from "../_components/ConciergeShell";
import { InsightsView } from "../_components/InsightsView";
import { dt } from "@/lib/dashboard/i18n";

/** مساعد العطاء  AI conclusions drawn from many conversations at once. */
export default function AiConciergeInsightsPage() {
  return (
    <ConciergeShell
      title={dt("استنتاجات الذكاء الاصطناعي")}
      icon={Lightbulb}
      description={dt("لخّص محادثات أي فترة واستخرج ما يطلبه الناس ولا يجدونه، الأسئلة والمشاكل المتكررة، وتوصيات عملية لتطوير الموقع.")}
    >
      <InsightsView />
    </ConciergeShell>
  );
}
