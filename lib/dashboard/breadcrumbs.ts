import { DASHBOARD_NAV_GROUPS } from "./nav-config";
import { dt } from "@/lib/dashboard/i18n";

export type Crumb = { label: string; href?: string };

const ROOT_LABEL = "لوحة التحكم";
const ROOT_HREF = "/dashboard";

// Arabic labels for path segments that sit BELOW a nav item and therefore have no entry in
// DASHBOARD_NAV_GROUPS. The old breadcrumb just printed the last raw segment with dashes
// swapped for spaces and `capitalize` applied, so an Arabic dashboard rendered
// "لوحة التحكم › audiences"  English, out of context, with no ancestor links.
const SEGMENT_LABELS: Record<string, string> = {
  get new() { return dt("إضافة جديد"); },
  get create() { return dt("إنشاء"); },
  get edit() { return dt("تعديل"); },
  get seo() { return dt("تحسين محركات البحث"); },
  get settings() { return dt("الإعدادات"); },
  get reports() { return dt("التقارير"); },
  get health() { return dt("فحص الاتصال"); },
  get logs() { return dt("السجلات"); },
  get import() { return dt("استيراد"); },
  get "bulk-import"() { return dt("استيراد جماعي"); },
  get layouts() { return dt("التخطيطات"); },
  get flows() { return dt("المسارات"); },
  get preferences() { return dt("التفضيلات"); },
  get providers() { return dt("المزودون"); },
  get routing() { return dt("التوجيه"); },
  get senders() { return dt("المرسِلون"); },
  get "provider-events"() { return dt("أحداث المزودين"); },
  get "delivery-logs"() { return dt("سجلات التسليم"); },
  get "cart-settings"() { return dt("إعدادات السلة"); },
  get donations() { return dt("التبرعات"); },
  get users() { return dt("المستخدمون"); },
  get donors() { return dt("المتبرعون"); },
  get team() { return dt("الفريق"); },
  get campaigns() { return dt("الحملات"); },
  get audiences() { return dt("الجمهور"); },
  get templates() { return dt("القوالب"); },
  get inbox() { return dt("المحادثات"); },
  get collections() { return dt("المجموعات"); },
  get documents() { return dt("المستندات"); },
  get assets() { return dt("الأصول"); },
  get projects() { return dt("المشاريع"); },
  get tasks() { return dt("المهام"); },
  get calendar() { return dt("التقويم"); },
  get content() { return dt("المحتوى"); },
  get publishing() { return dt("النشر"); },
  get communication() { return dt("التواصل"); },
  get marketing() { return dt("التسويق"); },
  get archive() { return dt("الأرشيف"); },
  get blog() { return dt("المدونة"); },
  get categories() { return dt("التصنيفات"); },
  get slides() { return dt("الشرائح"); },
  get ticker() { return dt("شريط التبرعات"); },
  get badges() { return dt("الشارات"); },
  get messages() { return dt("الرسائل"); },
  get telegram() { return dt("تيليجرام"); },
  webhooks: "Webhooks",
  get tracking() { return dt("التتبع"); },
  get attribution() { return dt("الإسناد"); },
  get performance() { return dt("الأداء"); },
  get recommendations() { return dt("التوصيات"); },
  get "ad-accounts"() { return dt("الحسابات الإعلانية"); },
  get "platform-connections"() { return dt("ربط المنصات"); },
  get "marketing-intelligence"() { return dt("ذكاء التسويق"); },
  get "bank-transfers"() { return dt("التحويلات البنكية"); },
  get "transfer-receipts"() { return dt("إيصالات التحويل"); },
  get monthly() { return dt("التبرعات الشهرية"); },
  get general() { return dt("عام"); },
  get "payment-gateways"() { return dt("بوابات الدفع"); },
};

/** Mongo ObjectId, cuid, uuid  anything that is an opaque record id rather than a route name. */
function isRecordId(segment: string): boolean {
  return (
    /^[0-9a-f]{24}$/i.test(segment) ||
    /^c[a-z0-9]{20,}$/i.test(segment) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
  );
}

function labelForSegment(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  if (isRecordId(segment)) return dt("تفاصيل");
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
  const root: Crumb = { label: dt(ROOT_LABEL), href: pathname === ROOT_HREF ? undefined : ROOT_HREF };
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
