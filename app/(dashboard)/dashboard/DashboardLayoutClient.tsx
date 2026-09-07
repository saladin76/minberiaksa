'use client';

import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';

import { localeDirection } from "@/lib/locales";
import SessionProvider from '@/components/providers/SessionProvider';
import { NextIntlClientProvider } from "next-intl";
import { Toaster } from "react-hot-toast";
import { ConfettiProvider } from "@/components/providers/confetti-provider";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { CurrencyFromUrlSync } from "@/components/CurrencyFromUrlSync";
import { ViewUserProfileProvider } from "@/context/ViewUserProfileContext";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Session } from "next-auth";
import {
  userCanEnterDashboard,
  userHasDashboardPermission,
  pathToDashboardPermission,
  getFirstAllowedDashboardHref,
} from "@/lib/dashboard/permissions";
import {
  DASHBOARD_NAV_GROUPS,
  DASHBOARD_NAV_HREFS_ORDERED,
  dashboardHrefToPermissionKey,
  resolveActiveDashboardHref,
} from "@/lib/dashboard/nav-config";
import { buildBreadcrumbs } from "@/lib/dashboard/breadcrumbs";
import { INBOX_UNREAD_EVENT } from "@/lib/messages/inbox-status";
import { DashboardSidebar } from "./_shell/DashboardSidebar";
import { DashboardTopbar } from "./_shell/DashboardTopbar";
import { CommandPalette } from "./_shell/CommandPalette";
import { DashboardAutoEnhancements } from "./_components/DashboardAutoEnhancements";
import { ProjectEditorSectionsEnhancer } from "./_components/ProjectEditorSectionsEnhancer";
import { ProjectLocaleSlugEditor } from "./_components/ProjectLocaleSlugEditor";

const COLLAPSE_STORAGE_KEY = 'dashboard-nav-collapsed';
const DEFAULT_COLLAPSED: Record<string, boolean> = {
  "ربط المنصات والإرسال": true,
  "الإدارة": true,
};

function DashboardContent({
  children,
  locale = "ar",
}: {
  children: React.ReactNode;
  locale?: string;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(DEFAULT_COLLAPSED);
  const dir = localeDirection(locale) as 'rtl' | 'ltr';
  const hasChecked = useRef(false);

  // Collapse state used to live only in useState, so every full page load re-collapsed the
  // groups and re-expanded the ones the user had closed.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (stored) setCollapsedGroups({ ...DEFAULT_COLLAPSED, ...JSON.parse(stored) });
    } catch { /* corrupt or unavailable storage — keep defaults */ }
  }, []);

  const toggleGroup = useCallback((g: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [g]: !prev[g] };
      try { window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    if (status !== "loading" && !hasChecked.current) {
      hasChecked.current = true;
      if (status === "unauthenticated") { router.replace("/ar/auth/signin"); return; }
      if (!userCanEnterDashboard(session?.user)) { router.replace("/"); return; }
    }
  }, [session, status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    if (!userCanEnterDashboard(session.user)) { router.replace("/"); return; }
    const required = pathToDashboardPermission(pathname);
    if (required && !userHasDashboardPermission(session.user, required)) {
      const fallback = getFirstAllowedDashboardHref(session.user, DASHBOARD_NAV_HREFS_ORDERED, dashboardHrefToPermissionKey);
      router.replace(fallback || "/");
    }
  }, [status, session, pathname, router]);

  const navigation = useMemo(() => {
    const u = session?.user;
    if (!u) return [];
    return DASHBOARD_NAV_GROUPS
      .map((section) => ({
        group: section.group,
        items: section.items.filter((item) => userHasDashboardPermission(u, item.key)),
      }))
      .filter((s) => s.items.length > 0);
  }, [session?.user]);

  const visibleHrefs = useMemo(
    () => navigation.flatMap((section) => section.items.map((item) => item.href)),
    [navigation],
  );
  const activeHref = useMemo(() => resolveActiveDashboardHref(pathname, visibleHrefs), [pathname, visibleHrefs]);
  const crumbs = useMemo(() => buildBreadcrumbs(pathname, visibleHrefs), [pathname, visibleHrefs]);

  // Auto-expand whichever group owns the current route, so a deep link never lands the user
  // on a page whose sidebar entry is hidden inside a collapsed group.
  useEffect(() => {
    if (!activeHref) return;
    const owner = DASHBOARD_NAV_GROUPS.find((g) => g.items.some((i) => i.href === activeHref));
    if (!owner) return;
    setCollapsedGroups((prev) => (prev[owner.group] ? { ...prev, [owner.group]: false } : prev));
  }, [activeHref]);

  /**
   * Live counts for nav items that declare a `badge` slug.
   *
   * Only polled when the item is actually in this user's filtered navigation: a staffer without
   * the `messages` permission would otherwise poll an endpoint that can only answer 403.
   *
   * `inboxCountEvent` lets the inbox page push the number down the instant the admin opens a
   * message, instead of leaving a stale badge until the next 60s tick.
   */
  const badgeKeys = useMemo(
    () => navigation.flatMap((s) => s.items.filter((i) => i.badge).map((i) => i.badge!)),
    [navigation],
  );
  const wantsInboxBadge = badgeKeys.includes('inboxUnread');
  const [navCounts, setNavCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!wantsInboxBadge) return;
    let cancelled = false;
    const setInbox = (n: number) =>
      setNavCounts((prev) => (prev.inboxUnread === n ? prev : { ...prev, inboxUnread: n }));

    const run = async () => {
      try {
        const res = await fetch('/api/admin/messages/unread-count', { cache: 'no-store' });
        if (!res.ok) { if (!cancelled) setInbox(0); return; }
        const data = await res.json();
        // ok:false means the count failed server-side; show no badge rather than a false "0 left".
        if (!cancelled) setInbox(data?.ok === false ? 0 : Number(data?.count ?? 0));
      } catch {
        if (!cancelled) setInbox(0);
      }
    };

    run();
    const timer = setInterval(run, 60000);
    const onLocalChange = (e: Event) => {
      const delta = (e as CustomEvent<{ delta?: number }>).detail?.delta;
      if (typeof delta !== 'number' || !Number.isFinite(delta)) return;
      setNavCounts((prev) => ({
        ...prev,
        inboxUnread: Math.max(0, (prev.inboxUnread ?? 0) + delta),
      }));
    };
    window.addEventListener(INBOX_UNREAD_EVENT, onLocalChange);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(INBOX_UNREAD_EVENT, onLocalChange);
    };
  }, [wantsInboxBadge]);

  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
  const openSearch = useCallback(() => { setIsSidebarOpen(false); setIsSearchOpen(true); }, []);

  if (status === 'loading') return <LoadingSkeleton />;

  return (
    <div className="min-h-screen flex bg-slate-50" dir={dir}>
      <DashboardAutoEnhancements />
      <ProjectEditorSectionsEnhancer />
      <ProjectLocaleSlugEditor />

      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden"
          onClick={closeSidebar}
          aria-hidden
        />
      )}

      <DashboardSidebar
        navigation={navigation}
        badgeCounts={navCounts}
        activeHref={activeHref}
        collapsedGroups={collapsedGroups}
        onToggleGroup={toggleGroup}
        user={session?.user}
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        onOpenSearch={openSearch}
        dir={dir}
      />

      <CommandPalette
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        navigation={navigation}
        dir={dir}
      />

      <main
        className={`flex-1 min-w-0 ${dir === 'rtl' ? 'lg:mr-[268px]' : 'lg:ml-[268px]'}`}
      >
        <DashboardTopbar
          crumbs={crumbs}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onOpenSearch={openSearch}
          dir={dir}
        />

        {/* Content well. Pages own their own surfaces (Card, PageHeader, …) — the shell no
            longer wraps every route in a white rounded card, which produced a box-inside-a-box
            with doubled padding on every one of the 151 routes. */}
        <div className="p-3 sm:p-4 lg:p-6 min-h-[calc(100vh-4rem)]">{children}</div>
      </main>
    </div>
  );
}

const LoadingSkeleton = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-brand rounded-full animate-spin" />
      <p className="text-sm text-slate-400 font-medium">جاري التحميل...</p>
    </div>
  </div>
);

export default function DashboardLayoutClient({
  children, session, messages, locale = "ar",
}: {
  children: React.ReactNode;
  session: Session | null;
  messages: Record<string, string | Record<string, string>>;
  locale?: string;
}) {
  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <CurrencyProvider>
        <Suspense fallback={null}><CurrencyFromUrlSync /></Suspense>
        <SessionProvider session={session}>
          {/* DashboardThemeProvider was mounted here but `useDashboardTheme` had zero consumers
              anywhere in the app — it only wrote a `dashboard-theme-dark` key to localStorage. */}
          <ViewUserProfileProvider>
            <DashboardContent locale={locale}>{children}</DashboardContent>
          </ViewUserProfileProvider>
          <ConfettiProvider />
          <Toaster position="top-center" toastOptions={{
            style: { fontFamily: 'inherit', fontSize: '14px' },
            success: { iconTheme: { primary: '#025EB8', secondary: '#fff' } },
          }} />
        </SessionProvider>
      </CurrencyProvider>
      <Analytics />
      <SpeedInsights />
    </NextIntlClientProvider>
  );
}
