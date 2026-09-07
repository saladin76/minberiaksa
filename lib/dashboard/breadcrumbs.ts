import { DASHBOARD_NAV_GROUPS } from "./nav-config";

export type Crumb = { label: string; href?: string };

const ROOT_LABEL = "لوحة التحكم";
const ROOT_HREF = "/dashboard";

// Arabic labels for path segments that sit BELOW a nav item and therefore have no entry in
// DASHBOARD_NAV_GROUPS. The old breadcrumb just printed the last raw segment with dashes
// swapped for spaces and `capitalize` applied, so an Arabic dashboard rendered
// "لوحة التحكم › audiences" — English, out of context, with no ancestor links.
const SEGMENT_LABELS: Record<string, string> = {
  new: "إضافة جديد",
  create: "إنشاء",
  edit: "تعديل",
  seo: "تحسين محركات البحث",
  settings: "الإعدادات",
  reports: "التقارير",
  health: "فحص الاتصال",
  logs: "السجلات",
  import: "استيراد",
  "bulk-import": "استيراد جماعي",
  layouts: "التخطيطات",
  flows: "المسارات",
  preferences: "التفضيلات",
  providers: "المزودون",
  routing: "التوجيه",
  senders: "المرسِلون",
  "provider-events": "أحداث المزودين",
  "delivery-logs": "سجلات التسليم",
  "team-support-defaults": "إعدادات دعم الفريق",
  donations: "التبرعات",
  users: "المستخدمون",
  donors: "المتبرعون",
  team: "الفريق",
  campaigns: "الحملات",
  audiences: "الجمهور",
  templates: "القوالب",
  inbox: "المحادثات",
  collections: "المجموعات",
  documents: "المستندات",
  assets: "الأصول",
  projects: "المشاريع",
  tasks: "المهام",
  calendar: "التقويم",
  content: "المحتوى",
  publishing: "النشر",
  communication: "التواصل",
  marketing: "التسويق",
  archive: "الأرشيف",
  blog: "المدونة",
  categories: "التصنيفات",
  slides: "الشرائح",
  ticker: "شريط التبرعات",
  badges: "الشارات",
  messages: "الرسائل",
  telegram: "تيليجرام",
  webhooks: "Webhooks",
  tracking: "التتبع",
  attribution: "الإسناد",
  performance: "الأداء",
  recommendations: "التوصيات",
  "ad-accounts": "الحسابات الإعلانية",
  "platform-connections": "ربط المنصات",
  "marketing-intelligence": "ذكاء التسويق",
  "bank-transfers": "التحويلات البنكية",
  monthly: "التبرعات الشهرية",
  general: "عام",
  "payment-gateways": "بوابات الدفع",
};

/** Mongo ObjectId, cuid, uuid — anything that is an opaque record id rather than a route name. */
function isRecordId(segment: string): boolean {
  return (
    /^[0-9a-f]{24}$/i.test(segment) ||
    /^c[a-z0-9]{20,}$/i.test(segment) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
  );
}

function labelForSegment(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  if (isRecordId(segment)) return "تفاصيل";
  return segment.replace(/-/g, " ");
}

/**
 * Builds a full ancestor trail for the current pathname:
 *   لوحة التحكم › التواصل › الجمهور › تفاصيل
 * The group name is included as a non-link (groups have no landing page), the matched nav
 * item is linked, and any deeper segments are linked to their own prefix so the user can
 * step back up one level at a time.
 *
 * `visibleHrefs` should be the hrefs the current user is actually permitted to see, so the
 * trail never links somewhere the permission guard will bounce them out of.
 */
export function buildBreadcrumbs(pathname: string, visibleHrefs?: readonly string[]): Crumb[] {
  const root: Crumb = { label: ROOT_LABEL, href: pathname === ROOT_HREF ? undefined : ROOT_HREF };
  if (pathname === ROOT_HREF) return [root];

  const allowed = visibleHrefs ? new Set(visibleHrefs) : null;

  // Deepest nav item that prefixes this path.
  let match: { group: string; title: string; href: string } | null = null;
  for (const group of DASHBOARD_NAV_GROUPS) {
    for (const item of group.items) {
      if (item.href === ROOT_HREF) continue;
      if (allowed && !allowed.has(item.href)) continue;
      const hit = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (hit && (!match || item.href.length > match.href.length)) {
        match = { group: group.group, title: item.title, href: item.href };
      }
    }
  }

  const crumbs: Crumb[] = [root];

  if (match) {
    crumbs.push({ label: match.group });
    const isLeaf = pathname === match.href;
    crumbs.push({ label: match.title, href: isLeaf ? undefined : match.href });

    const rest = pathname.slice(match.href.length).split("/").filter(Boolean);
    rest.forEach((segment, i) => {
      const href = `${match!.href}/${rest.slice(0, i + 1).join("/")}`;
      const last = i === rest.length - 1;
      crumbs.push({ label: labelForSegment(segment), href: last ? undefined : href });
    });
    return crumbs;
  }

  // No nav item owns this path (e.g. the orphaned marketing-intelligence/* and brand/* trees).
  // Fall back to labelling every segment so the trail is still Arabic and still navigable.
  const segments = pathname.split("/").filter(Boolean).slice(1); // drop "dashboard"
  segments.forEach((segment, i) => {
    const href = `/dashboard/${segments.slice(0, i + 1).join("/")}`;
    const last = i === segments.length - 1;
    crumbs.push({ label: labelForSegment(segment), href: last ? undefined : href });
  });
  return crumbs;
}
