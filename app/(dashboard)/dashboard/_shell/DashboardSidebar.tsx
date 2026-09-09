'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ChevronDown, LogOut, Search, X } from 'lucide-react';
import { signOut } from 'next-auth/react';

import { cn } from '@/lib/utils';
import { NAV_ICONS } from '@/lib/dashboard/nav-icons';
import type { DashboardNavGroup } from '@/lib/dashboard/nav-config';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The unread pill. Brand blue rather than the usual notification red — this is "there is work
 * here", not "something is wrong", and red beside a nav label reads as an error state.
 *
 * Capped at 99+ so a long-neglected inbox cannot widen the item and push the label into an
 * ellipsis. `tabular-nums` keeps the pill from twitching as the number changes under the poll.
 */
function NavCountBadge({ count, label }: { count: number; label: string }) {
  return (
    <span
      className={cn(
        'shrink-0 min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center',
        'rounded-full bg-brand text-white text-[10.5px] font-bold leading-none tabular-nums',
        'shadow-sm shadow-brand/30',
      )}
      // The digits alone are meaningless to a screen reader sitting after "الرسائل الواردة".
      aria-label={`${count} ${label}`}
    >
      <span aria-hidden>{count > 99 ? '99+' : count}</span>
    </span>
  );
}

type Props = {
  navigation: DashboardNavGroup[];
  /** Live counts keyed by `DashboardNavItem.badge`. Missing or 0 renders no pill. */
  badgeCounts?: Record<string, number>;
  activeHref: string | null;
  collapsedGroups: Record<string, boolean>;
  onToggleGroup: (group: string) => void;
  user: { name?: string | null; email?: string | null; image?: string | null } | undefined;
  isOpen: boolean;
  onClose: () => void;
  onOpenSearch: () => void;
  dir: 'rtl' | 'ltr';
};

export function DashboardSidebar({
  navigation, badgeCounts, activeHref, collapsedGroups, onToggleGroup,
  user, isOpen, onClose, onOpenSearch, dir,
}: Props) {
  const asideRef = useRef<HTMLElement>(null);

  // The drawer previously had no Escape handler and no focus trap: on mobile it was possible
  // to tab straight through the overlay into the page behind it.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const root = asideRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const userInitials = (user?.name || user?.email || 'U').slice(0, 2).toUpperCase();

  return (
    <aside
      ref={asideRef}
      id="dashboard-sidebar"
      aria-label="التنقل الرئيسي"
      className={cn(
        'fixed top-0 z-40 h-full w-[268px] flex flex-col transition-transform duration-300 ease-out',
        'bg-white border-slate-200',
        dir === 'rtl' ? 'right-0 border-l' : 'left-0 border-r',
        'lg:translate-x-0',
        isOpen ? 'translate-x-0' : dir === 'rtl' ? 'translate-x-full' : '-translate-x-full',
      )}
    >
      {/* Brand bar */}
      <div className="h-16 flex items-center justify-between gap-2 px-4 border-b bg-brand shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <img src="/logometaminber.avif" alt="" className="h-12 w-auto object-contain brightness-0 invert" />
          </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق القائمة"
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search trigger — opens the ⌘K palette */}
      <div className="px-3 pt-3 shrink-0">
        <button
          type="button"
          onClick={onOpenSearch}
          className="w-full flex items-center gap-2 px-3 h-9 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-[13px] hover:bg-slate-100 hover:border-slate-300 transition-colors"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 text-start">بحث سريع…</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 h-5 rounded border border-slate-300 bg-white text-[10px] font-sans text-slate-400">
            Ctrl K
          </kbd>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4 sidebar-scroll-light">
        {navigation.map((section) => {
          const collapsed = collapsedGroups[section.group] ?? false;
          // A count hidden inside a folded group is a count nobody sees, so the group header
          // carries the total of its own items while it is closed.
          const groupCount = collapsed
            ? section.items.reduce((sum, i) => sum + (i.badge ? badgeCounts?.[i.badge] ?? 0 : 0), 0)
            : 0;
          return (
            <div key={section.group}>
              <button
                type="button"
                onClick={() => onToggleGroup(section.group)}
                aria-expanded={!collapsed}
                className="w-full px-2 py-1 mb-1 flex items-center justify-between gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors"
              >
                <span className="truncate">{section.group}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {groupCount > 0 && <NavCountBadge count={groupCount} label="عنصر غير مقروء" />}
                  <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', collapsed && '-rotate-90')} />
                </span>
              </button>

              {!collapsed && (
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = NAV_ICONS[item.icon];
                    const active = item.href === activeHref;
                    const count = item.badge ? badgeCounts?.[item.badge] ?? 0 : 0;
                    return (
                      // <Link>, not <button onClick={router.push}> — restores prefetch,
                      // middle-click, ctrl-click and "open in new tab".
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'group relative w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium transition-colors',
                          active
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                        )}
                      >
                        {active && (
                          <span
                            className={cn(
                              'absolute inset-y-1.5 w-[3px] rounded-full bg-brand',
                              dir === 'rtl' ? '-right-2.5' : '-left-2.5',
                            )}
                            aria-hidden
                          />
                        )}
                        <span className="flex items-center gap-2.5 min-w-0">
                          <Icon className={cn('w-[17px] h-[17px] shrink-0', active ? 'text-brand' : 'text-slate-400 group-hover:text-slate-600')} />
                          {/* Unread items read as unread: a heavier label, matching the way the
                              cards inside the inbox weight an unopened message. The darkening
                              is skipped on the active item, whose brand colour already carries
                              more emphasis than slate-900 would. */}
                          <span
                            className={cn(
                              'truncate',
                              count > 0 && 'font-bold',
                              count > 0 && !active && 'text-slate-900',
                            )}
                          >
                            {item.title}
                          </span>
                        </span>
                        {count > 0 && <NavCountBadge count={count} label="رسالة غير مقروءة" />}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User menu */}
      <div className="border-t border-slate-200 p-2.5 shrink-0">
        <DropdownMenu dir={dir}>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-100 transition-colors text-start">
              <span className="w-8 h-8 rounded-full bg-brand-orange flex items-center justify-center text-white text-[11px] font-bold shrink-0 overflow-hidden">
                {user?.image ? <img src={user.image} alt="" className="w-full h-full object-cover" /> : userInitials}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold text-slate-900 truncate">{user?.name || 'Admin'}</span>
                <span className="block text-[11px] text-slate-500 truncate">{user?.email || ''}</span>
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-[240px]">
            <DropdownMenuLabel className="truncate font-normal text-xs text-slate-500">
              {user?.email || ''}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/" target="_blank" className="cursor-pointer">عرض الموقع</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/users/team" className="cursor-pointer">الفريق والصلاحيات</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/' })}
              className="cursor-pointer text-red-600 focus:text-red-600"
            >
              <LogOut className="w-4 h-4" />
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
