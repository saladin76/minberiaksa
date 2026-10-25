"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, Newspaper, PanelsTopLeft } from "lucide-react";
import { dashDir, dt } from "@/lib/dashboard/i18n";
import { cn } from "@/lib/utils";

const GROUPS = [
  {
    id: "projects",
    get label() { return dt("المشاريع والتصنيفات"); },
    icon: FolderKanban,
    links: [
      { href: "/dashboard/campaigns", get label() { return dt("المشاريع"); } },
      { href: "/dashboard/categories", get label() { return dt("التصنيفات"); } },
      { href: "/dashboard/super-categories", get label() { return dt("الأقسام الكبرى"); } },
    ],
  },
  {
    id: "editorial",
    get label() { return dt("المحتوى التحريري"); },
    icon: Newspaper,
    links: [
      { href: "/dashboard/editorial-planner", get label() { return dt("خطة المقالات والترجمات"); } },
      { href: "/dashboard/blog", get label() { return dt("المقالات"); } },
      { href: "/dashboard/videos", get label() { return dt("الفيديوهات"); } },
      { href: "/dashboard/stories", get label() { return dt("القصص"); } },
      { href: "/dashboard/playlists", get label() { return dt("برامجنا المصورة"); } },
      { href: "/dashboard/courses", get label() { return dt("دوراتنا"); } },
      { href: "/dashboard/reports", get label() { return dt("التقارير"); } },
      { href: "/dashboard/booklets", get label() { return dt("الكتيبات"); } },
      { href: "/dashboard/faqs", get label() { return dt("الأسئلة الشائعة"); } },
    ],
  },
  {
    id: "homepage",
    get label() { return dt("الصفحة الرئيسية"); },
    icon: PanelsTopLeft,
    links: [
      { href: "/dashboard/slides", get label() { return dt("شرائح الواجهة"); } },
      { href: "/dashboard/ticker", get label() { return dt("شريط التبرعات"); } },
      { href: "/dashboard/urgent-banners", get label() { return dt("البانرات العاجلة"); } },
      { href: "/dashboard/homepage-layout", get label() { return dt("ترتيب الصفحة"); } },
      { href: "/dashboard/quick-donation", get label() { return dt("التبرع السريع"); } },
    ],
  },
] as const;

function groupForPath(pathname: string) {
  if (pathname.startsWith("/dashboard/campaigns") || pathname.startsWith("/dashboard/categories") || pathname.startsWith("/dashboard/super-categories")) return GROUPS[0];
  if (pathname.startsWith("/dashboard/editorial-planner") || pathname.startsWith("/dashboard/blog") || pathname.startsWith("/dashboard/videos") || pathname.startsWith("/dashboard/stories") || ["/dashboard/playlists", "/dashboard/courses", "/dashboard/reports", "/dashboard/booklets", "/dashboard/faqs"].some((path) => pathname.startsWith(path))) return GROUPS[1];
  return GROUPS[2];
}

export function ContentSuiteNavigation() {
  const pathname = usePathname().replace(/^\/dashboard\/content\/([^/]+)\/.*$/, "/dashboard/$1");
  const group = groupForPath(pathname);
  const GroupIcon = group.icon;

  return (
    <section dir={dashDir()} className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label={dt("مساحة إدارة المحتوى")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-l from-slate-50 to-white px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
            <GroupIcon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{dt("استوديو المحتوى")}</p>
            <p className="truncate text-sm font-semibold text-slate-800">{group.label}</p>
          </div>
        </div>
        <nav className="flex max-w-full items-center gap-1 overflow-x-auto pb-0.5" aria-label={group.label}>
          {group.links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                  active ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </section>
  );
}
