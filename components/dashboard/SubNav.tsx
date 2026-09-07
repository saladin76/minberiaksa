"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SubNavItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
};

/**
 * Secondary navigation for a route cluster whose pages share one sidebar entry.
 *
 * Three competing, section-private patterns existed before this: `MarketingQuickNav` (a
 * hardcoded pill row), `MarketingWorkflowHeader` (its own 3-level breadcrumb) and the nav
 * embedded in `ArchiveConsole`. The first two turned out to render only on routes that
 * `next.config.ts` redirects away, so this replaces the one that is actually reachable and
 * gives future clusters a single shape to reuse.
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
      aria-label="التنقل داخل القسم"
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
