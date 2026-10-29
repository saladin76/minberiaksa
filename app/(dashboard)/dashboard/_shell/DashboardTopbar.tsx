'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, ExternalLink, Menu, MessagesSquare, Search, Settings2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Crumb } from '@/lib/dashboard/breadcrumbs';
import CurrencySelector from '@/components/CurrencySelector';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DashboardLanguageToggle } from './DashboardLanguageToggle';
import { dt } from "@/lib/dashboard/i18n";

type Props = {
  crumbs: Crumb[];
  onOpenSidebar: () => void;
  onOpenSearch: () => void;
  dir: 'rtl' | 'ltr';
  sidebarOpen?: boolean;
  showWhatsappInbox?: boolean;
  whatsappInboxCount?: number;
  showGeneralInbox?: boolean;
  generalInboxCount?: number;
};

function WhatsappMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="h-[22px] w-[22px] fill-current">
      <path d="M16.02 3.2A12.74 12.74 0 0 0 5.11 22.52L3.4 28.8l6.45-1.69A12.78 12.78 0 1 0 16.02 3.2Zm0 23.34c-1.94 0-3.84-.52-5.5-1.51l-.39-.23-3.83 1 1.02-3.73-.25-.39a10.54 10.54 0 1 1 8.95 4.86Zm5.79-7.9c-.32-.16-1.9-.94-2.2-1.04-.3-.11-.51-.16-.72.16-.21.31-.83 1.04-1.02 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.19-.31-.02-.48.14-.64.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.72-.98-2.36-.26-.62-.52-.54-.72-.55h-.62c-.21 0-.56.08-.83.4-.29.32-1.1 1.08-1.1 2.62 0 1.55 1.13 3.04 1.29 3.25.16.21 2.22 3.37 5.38 4.73.75.32 1.34.52 1.8.67.76.24 1.45.21 1.99.13.61-.09 1.9-.78 2.17-1.53.27-.75.27-1.39.19-1.53-.08-.13-.29-.21-.61-.37Z" />
    </svg>
  );
}

export function DashboardTopbar({ crumbs, onOpenSidebar, onOpenSearch, dir, sidebarOpen = false, showWhatsappInbox = false, whatsappInboxCount = 0, showGeneralInbox = false, generalInboxCount = 0 }: Props) {
  const Separator = dir === 'rtl' ? ChevronLeft : ChevronRight;
  const iconButton = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
  return <header className="sticky top-0 z-20 flex h-16 min-w-0 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md sm:gap-3 sm:px-4 lg:px-6">
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <button type="button" onClick={onOpenSidebar} aria-expanded={sidebarOpen} aria-label={dt("فتح القائمة")} aria-controls="dashboard-sidebar" className={cn(iconButton, "lg:hidden")}><Menu size={20} /></button>
      <nav aria-label={dt("مسار التنقل")} className="min-w-0"><ol className="flex min-w-0 items-center gap-1 text-[13px]">{crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return <li key={`${crumb.label}-${index}`} className={cn("min-w-0 items-center gap-1", last ? "flex" : "hidden sm:flex")}>
          {index > 0 ? <Separator className="hidden h-3.5 w-3.5 shrink-0 text-slate-300 sm:block" aria-hidden="true" /> : null}
          {crumb.href && !last ? <Link href={crumb.href} className="truncate text-slate-500 transition-colors hover:text-brand">{crumb.label}</Link> : <span aria-current={last ? "page" : undefined} className={cn("truncate", last ? "font-semibold text-slate-900" : "text-slate-400")}>{crumb.label}</span>}
        </li>;
      })}</ol></nav>
    </div>
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <button type="button" onClick={onOpenSearch} aria-label={dt("بحث")} className={cn(iconButton, "lg:hidden")}><Search size={18} /></button>
      {showWhatsappInbox ? <Link href="/dashboard/communication/inbox" className={cn("relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:w-auto sm:gap-1.5 sm:px-2", whatsappInboxCount > 0 ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100" : "border-slate-200 bg-white hover:bg-emerald-50")} aria-label={whatsappInboxCount > 0 ? dt("واتساب، {0} محادثة غير مقروءة", [whatsappInboxCount]) : dt("محادثات واتساب")}>
        <WhatsappMark />{whatsappInboxCount > 0 ? <span className="absolute -end-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-white sm:static sm:ring-0">{whatsappInboxCount > 99 ? "99+" : whatsappInboxCount}</span> : null}
      </Link> : null}
      {showGeneralInbox ? <Link href="/dashboard/inbox" className={cn(iconButton, "relative", generalInboxCount > 0 && "border-sky-300 bg-sky-50 text-sky-800")} aria-label={generalInboxCount > 0 ? dt("الرسائل الواردة، {0} غير مقروءة", [generalInboxCount]) : dt("الرسائل الواردة")}><MessagesSquare size={18} />{generalInboxCount > 0 ? <span className="absolute -end-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold tabular-nums text-white ring-2 ring-white">{generalInboxCount > 99 ? "99+" : generalInboxCount}</span> : null}</Link> : null}
      <div className="sm:hidden"><Popover><PopoverTrigger asChild><button type="button" className={iconButton} aria-label={dt("إعدادات العرض")}><Settings2 size={18} /></button></PopoverTrigger><PopoverContent dir={dir} align="end" className="w-72 max-w-[calc(100vw-2rem)] space-y-4 rounded-xl p-4">
        <div className="space-y-2"><p className="text-xs font-semibold text-slate-500">{dt("لغة لوحة التحكم")}</p><DashboardLanguageToggle /></div>
        <div className="space-y-2"><p className="text-xs font-semibold text-slate-500">{dt("عملة العرض")}</p><CurrencySelector showDefaultCurrencyOption onDark={false} /></div>
        <Link href="/" target="_blank" className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm text-brand">{dt("عرض الموقع")}<ExternalLink size={14} /></Link>
      </PopoverContent></Popover></div>
      <div className="hidden items-center gap-2 sm:flex"><DashboardLanguageToggle /><CurrencySelector showDefaultCurrencyOption onDark={false} /><Link href="/" target="_blank" className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:text-brand">{dt("عرض الموقع")}<ExternalLink size={14} /></Link></div>
    </div>
  </header>;
}
