"use client";

import type { ReactNode } from "react";
import { Bot, Lightbulb, MessagesSquare, Sparkles, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SubNav } from "@/components/dashboard/SubNav";
import { dashDir, dt } from "@/lib/dashboard/i18n";

const SUBNAV = [
  { get label() { return dt("الأداء والتبرعات"); }, href: "/dashboard/ai-concierge", icon: Sparkles },
  { get label() { return dt("المحادثات"); }, href: "/dashboard/ai-concierge/conversations", icon: MessagesSquare },
  { get label() { return dt("استنتاجات الذكاء الاصطناعي"); }, href: "/dashboard/ai-concierge/insights", icon: Lightbulb },
  { get label() { return dt("الإعدادات"); }, href: "/dashboard/ai-concierge/settings", icon: Bot },
];

/** The frame every مساعد العطاء page shares: header, then the section's own tabs. */
export function ConciergeShell({
  title,
  description,
  icon,
  actions,
  children,
}: {
  title: string;
  description: ReactNode;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-0" dir={dashDir()}>
      <div className="space-y-6 p-0 sm:p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
        <div>
          <PageHeader eyebrow={dt("مساعد العطاء (AI)")} title={title} description={description} icon={icon} actions={actions} className="mb-4" />
          <SubNav items={SUBNAV} className="mb-0" />
        </div>
        {children}
      </div>
    </div>
  );
}
