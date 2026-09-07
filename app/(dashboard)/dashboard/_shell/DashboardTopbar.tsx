'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, ExternalLink, Menu, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Crumb } from '@/lib/dashboard/breadcrumbs';
import CurrencySelector from '@/components/CurrencySelector';

type Props = {
  crumbs: Crumb[];
  onOpenSidebar: () => void;
  onOpenSearch: () => void;
  dir: 'rtl' | 'ltr';
};

export function DashboardTopbar({ crumbs, onOpenSidebar, onOpenSearch, dir }: Props) {
  // Chevrons are directional: in RTL the trail reads right-to-left, so the separator must
  // point left. The old shell used ChevronLeft unconditionally.
  const Separator = dir === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <header
      className={cn(
        'sticky top-0 z-20 h-16 flex items-center justify-between gap-3 px-3 sm:px-4 lg:px-6',
        'bg-white/85 backdrop-blur-md border-b border-slate-200',
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="فتح القائمة"
          aria-controls="dashboard-sidebar"
          className="lg:hidden w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav aria-label="مسار التنقل" className="min-w-0">
          <ol className="flex items-center gap-1 text-[13px] min-w-0">
            {crumbs.map((crumb, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={`${crumb.label}-${i}`} className="flex items-center gap-1 min-w-0">
                  {i > 0 && <Separator className="w-3.5 h-3.5 text-slate-300 shrink-0" aria-hidden />}
                  {crumb.href && !last ? (
                    <Link
                      href={crumb.href}
                      className="text-slate-500 hover:text-brand transition-colors truncate max-w-[9rem] sm:max-w-none"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      aria-current={last ? 'page' : undefined}
                      className={cn(
                        'truncate max-w-[9rem] sm:max-w-none',
                        last ? 'font-semibold text-slate-900' : 'text-slate-400',
                      )}
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="بحث"
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <Search className="w-4 h-4" />
        </button>
        <CurrencySelector showDefaultCurrencyOption onDark={false} />
        <Link
          href="/"
          target="_blank"
          className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:text-brand hover:border-brand-200 transition-colors whitespace-nowrap"
        >
          عرض الموقع
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </header>
  );
}
