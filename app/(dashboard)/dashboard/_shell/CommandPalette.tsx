'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ExternalLink, LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';

import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandSeparator,
} from '@/components/ui/command';
import { NAV_ICONS } from '@/lib/dashboard/nav-icons';
import type { DashboardNavGroup } from '@/lib/dashboard/nav-config';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navigation: DashboardNavGroup[];
  dir: 'rtl' | 'ltr';
};

/**
 * ⌘K / Ctrl+K navigation. The sidebar carries 40 permission-filtered destinations across 7
 * collapsible groups with no search of any kind, so reaching a page meant expanding groups
 * and scanning. Only pages the user can actually see are listed — `navigation` is already
 * permission-filtered upstream.
 */
export function CommandPalette({ open, onOpenChange, navigation, dir }: Props) {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div dir={dir}>
        <CommandInput placeholder="ابحث عن صفحة أو إجراء…" />
        <CommandList className="max-h-[60vh]">
          <CommandEmpty className="py-8 text-center text-sm text-slate-500">
            لا توجد نتائج مطابقة.
          </CommandEmpty>

          {navigation.map((section) => (
            <CommandGroup key={section.group} heading={section.group}>
              {section.items.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                return (
                  <CommandItem
                    key={item.href}
                    value={`${item.title} ${section.group} ${(item.keywords ?? []).join(' ')}`}
                    onSelect={() => go(item.href)}
                    className="gap-2.5 cursor-pointer"
                  >
                    <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{item.title}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}

          <CommandSeparator />
          <CommandGroup heading="إجراءات">
            <CommandItem
              value="عرض الموقع view site"
              onSelect={() => { onOpenChange(false); window.open('/', '_blank'); }}
              className="gap-2.5 cursor-pointer"
            >
              <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
              <span>عرض الموقع</span>
            </CommandItem>
            <CommandItem
              value="تسجيل الخروج logout sign out"
              onSelect={() => { onOpenChange(false); signOut({ callbackUrl: '/' }); }}
              className="gap-2.5 cursor-pointer text-red-600"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>تسجيل الخروج</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </div>
    </CommandDialog>
  );
}
