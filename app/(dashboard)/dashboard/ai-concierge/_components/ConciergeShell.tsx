"use client";

import type { ReactNode } from "react";
import { Bot, Lightbulb, MessagesSquare, Sparkles, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SubNav } from "@/components/dashboard/SubNav";

const SUBNAV = [
  { label: "الأداء والتبرعات", href: "/dashboard/ai-concierge", icon: Sparkles },
  { label: "المحادثات", href: "/dashboard/ai-concierge/conversations", icon: MessagesSquare },
  { label: "استنتاجات الذكاء الاصطناعي", href: "/dashboard/ai-concierge/insights", icon: Lightbulb },
  { label: "الإعدادات", href: "/dashboard/ai-concierge/settings", icon: Bot },
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
    <div className="min-h-0" dir="rtl">
      <div className="space-y-6 p-0 sm:p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
        <div>
          <PageHeader eyebrow="مساعد العطاء (AI)" title={title} description={description} icon={icon} actions={actions} className="mb-4" />
          <SubNav items={SUBNAV} className="mb-0" />
        </div>
        {children}
      </div>
    </div>
  );
}
