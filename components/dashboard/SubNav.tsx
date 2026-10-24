"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { dt } from "@/lib/dashboard/i18n";

export type SubNavItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
};

/**
 * Secondary navigation for a route cluster whose pages share one sidebar entry.
 *
 * The dashboard used to duplicate section navigation in several private components.
 * Marketing's old variants pointed mostly to redirects, while the archive UI that also used
 * this primitive has since been retired. Keep one reusable implementation for live and future
 * route clusters, including the AI concierge tabs.
 *
 * Active state uses longest-prefix matching so a detail route keeps its parent tab lit.
 */
export function SubNav({ items, className }: { items: SubNavItem[]; className?: string }) {
  const pathname = usePathname();

  const activeHref = items
    .map((i) => i.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav
      aria-label={dt("التنقل داخل القسم")}
      className={cn("mb-5 -mx-1 overflow-x-auto scrollbar-none", className)}
    >
      <div className="flex min-w-max items-center gap-1 px-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-[13px] font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-brand text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              {Icon && <Icon className={cn("w-4 h-4", active ? "text-white" : "text-slate-400")} />}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
