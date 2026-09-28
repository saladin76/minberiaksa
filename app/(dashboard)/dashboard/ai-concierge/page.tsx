"use client";

import { Sparkles } from "lucide-react";
import { ConciergeShell } from "./_components/ConciergeShell";
import { OverviewView } from "./_components/OverviewView";

/**
 * مساعد العطاء  performance: how many visitors use the donation concierge,
 * how far they get, and how much was given because of it (direct and indirect).
 */
export default function AiConciergeOverviewPage() {
  return (
    <ConciergeShell
      title="أداء مساعد العطاء"
      icon={Sparkles}
      description="كم زائرًا استخدم المساعد، إلى أين وصلوا، وكم تبرعًا جاء بفضله  مباشرة أو لاحقًا."
    >
      <OverviewView />
    </ConciergeShell>
  );
}
