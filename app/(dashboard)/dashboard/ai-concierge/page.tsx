"use client";

import { Sparkles } from "lucide-react";
import { ConciergeShell } from "./_components/ConciergeShell";
import { OverviewView } from "./_components/OverviewView";
import { dt } from "@/lib/dashboard/i18n";

/**
 * مساعد العطاء  performance: how many visitors use the donation concierge,
 * how far they get, and how much was given because of it (direct and indirect).
 */
export default function AiConciergeOverviewPage() {
  return (
    <ConciergeShell
      title={dt("أداء مساعد العطاء")}
      icon={Sparkles}
      description={dt("استخدام المساعد ومراحل رحلة التبرع، والتبرعات المنسوبة إليه مباشرة أو ضمن نافذة الإسناد.")}
    >
      <OverviewView />
    </ConciergeShell>
  );
}
