import type { DashboardPermissionKey } from "./permissions";
import type { NavIconName } from "./nav-icons";

export type DashboardNavItem = {
  key: DashboardPermissionKey;
  title: string;
  href: string;
  /** Rendered in the sidebar and the command palette. */
  icon: NavIconName;
  /** Extra search terms for the command palette — English slugs, synonyms, provider names. */
  keywords?: string[];
  /**
   * Opts this item into a live count pill in the sidebar.
   *
   * A slug, not a number: this module is plain serialisable data that server components import,
   * so it must not reach for a session, a database or a fetch. `DashboardLayoutClient` maps the
   * slug to a poller and hands the resolved numbers back down.
   */
  badge?: DashboardNavBadgeKey;
};

/** Counters the sidebar knows how to fetch. */
export type DashboardNavBadgeKey = "inboxUnread" | "transferReceiptsPending";

export type DashboardNavGroup = { group: string; items: DashboardNavItem[] };

// Sidebar Information Architecture — practical, permission-gated sections in a fixed order.
// Provider setup and operational sync stay under "ربط المنصات والإرسال".
//
// Every item carries its OWN icon. Icons used to be looked up by `key` (the permission key)
// in DashboardLayoutClient, which meant the six "التواصل" items and the five operations items
// all shared one permission key and therefore rendered the identical MessageSquare glyph —
// the icon column conveyed nothing. Per-item icons fix that.
//
// Titles are also unique across the whole sidebar now. "نظرة عامة" and "السجلات المتقدمة"
// each appeared twice in different groups, and "الحملات" meant message campaigns here but
// fundraising projects two groups up; with a command palette searching these labels,
// ambiguous titles become unusable.
export const DASHBOARD_NAV_GROUPS: DashboardNavGroup[] = [
  {
    group: "الرئيسية",
    items: [
      { key: "revenue", title: "اللوحة الرئيسية", href: "/dashboard", icon: "layoutDashboard", keywords: ["home", "overview", "الرئيسية"] },
      { key: "monthly", title: "التبرعات الشهرية", href: "/dashboard/monthly", icon: "repeat", keywords: ["monthly", "subscriptions", "اشتراكات"] },
      { key: "bankTransfers", title: "التحويلات البنكية", href: "/dashboard/bank-transfers", icon: "landmark", keywords: ["bank", "transfers", "حوالات", "statement", "كشف"] },
      // Receipts donors upload after choosing bank transfer at checkout, waiting on a finance
      // decision. A different queue from the statement importer above: that one starts from the
      // bank's file, this one from the donor's photo. Same permission — both are the finance desk.
      { key: "bankTransfers", title: "إيصالات التحويل", href: "/dashboard/transfer-receipts", icon: "receipt", keywords: ["receipts", "transfer", "إيصال", "إيصالات", "تحويل", "مراجعة", "review", "pending"], badge: "transferReceiptsPending" },
      { key: "donors", title: "المتبرعون", href: "/dashboard/users/donors", icon: "users", keywords: ["donors", "users", "متبرعين"] },
    ],
  },
  {
    // Everything an editor publishes to the public site — the fundraising catalogue
    // (projects, categories, blog, hero slides, ticker) and the CMS content behind the
    // homepage rails. Per-item permissions still apply; a staffer sees the rows they hold.
    group: "محتوى الموقع",
    items: [
      // The fundraising entries that used to head their own "الحملات والمحتوى" group. One
      // content group now: projects, categories and the blog are as much site content as
      // the stories and videos below them, and splitting fifteen items across two headings
      // put related things behind different folds.
      { key: "campaigns", title: "المشاريع", href: "/dashboard/campaigns", icon: "heart", keywords: ["projects", "campaigns", "مشاريع"] },
      { key: "categories", title: "الحملات والدول", href: "/dashboard/categories", icon: "globe", keywords: ["categories", "countries", "تصنيفات"] },
      { key: "blog", title: "المدونة", href: "/dashboard/blog", icon: "penLine", keywords: ["blog", "posts", "مقالات"] },
      { key: "slides", title: "الشرائح", href: "/dashboard/slides", icon: "images", keywords: ["slides", "slider", "hero"] },
      { key: "ticker", title: "شريط التبرعات", href: "/dashboard/ticker", icon: "ticket", keywords: ["ticker", "marquee"] },
      // ── CMS content (lib/content), all under the one siteContent permission ──
      { key: "siteContent", title: "الأقسام الكبرى", href: "/dashboard/super-categories", icon: "layers", keywords: ["super", "category", "programme", "landing", "أقسام", "برنامج", "عبادا لنا"] },
      { key: "siteContent", title: "شريط القصص", href: "/dashboard/stories", icon: "images", keywords: ["stories", "قصص", "rail", "highlights"] },
      { key: "siteContent", title: "البانرات", href: "/dashboard/urgent-banners", icon: "alertTriangle", keywords: ["urgent", "banner", "banners", "emergency", "طوارئ", "بانر", "بانرات", "عاجل", "شد الرحال", "placement"] },
      { key: "siteContent", title: "التبرع السريع", href: "/dashboard/quick-donation", icon: "heartHandshake", keywords: ["quick", "donation", "donate", "amounts", "presets", "سريع", "مبالغ", "مقترحة", "dock"] },
      { key: "siteContent", title: "الفيديوهات", href: "/dashboard/videos", icon: "video", keywords: ["videos", "فيديو", "achievements", "endorsements", "إنجازات", "تزكيات"] },
      { key: "siteContent", title: "برامجنا المصورة", href: "/dashboard/playlists", icon: "listVideo", keywords: ["playlists", "programs", "series", "برامج", "سلاسل", "youtube"] },
      { key: "siteContent", title: "دوراتنا", href: "/dashboard/courses", icon: "graduationCap", keywords: ["courses", "دورات", "training"] },
      { key: "siteContent", title: "التقارير", href: "/dashboard/reports", icon: "fileText", keywords: ["reports", "تقارير", "pdf", "annual"] },
      { key: "siteContent", title: "الكتيبات", href: "/dashboard/booklets", icon: "bookOpen", keywords: ["booklets", "كتيبات", "pdf", "library"] },
      { key: "siteContent", title: "الأسئلة الشائعة", href: "/dashboard/faqs", icon: "helpCircle", keywords: ["faq", "أسئلة", "questions", "help"] },
      { key: "siteContent", title: "الحسابات البنكية", href: "/dashboard/bank-accounts", icon: "landmark", keywords: ["bank", "accounts", "iban", "swift", "حسابات", "بنك"] },
    ],
  },
  {
    group: "التواصل",
    items: [
      // The six "مركز التواصل" entries that lived here pointed into /dashboard/operations, which
      // has been removed along with the whole التشغيل section. What remains below is the part of
      // التواصل that is not operations: the template/trigger editor and the send log.
      // Previously unreachable (no nav entry, no inbound link) despite being fully built with
      // working APIs. Titled "قوالب البريد والمحفّزات" rather than "القوالب" to distinguish it
      // from the communication-campaign templates directly above — it is a different page that
      // owns the email/WhatsApp templates AND the message triggers, including the
      // DONATION_LAPSED reminder.
      // Per-channel pages: each answers "what did we send on this channel, and what happened to
      // it afterwards" — the delivery/open/click detail the flat send log cannot show.
      { key: "messages", title: "الحملات التسويقية", href: "/dashboard/communication/campaigns", icon: "megaphone", keywords: ["campaigns", "marketing", "حملات", "تسويق", "broadcast", "bulk"] },
      { key: "messages", title: "البريد الإلكتروني", href: "/dashboard/communication/email", icon: "mail", keywords: ["email", "بريد", "elastic"] },
      { key: "messages", title: "واتساب", href: "/dashboard/communication/whatsapp", icon: "messageCircle", keywords: ["whatsapp", "واتساب", "meta"] },
      { key: "messages", title: "الرسائل النصية", href: "/dashboard/communication/sms", icon: "messageSquare", keywords: ["sms", "نصية", "netgsm", "brevo"] },
      { key: "templates", title: "قوالب البريد والمحفّزات", href: "/dashboard/templates", icon: "mail", keywords: ["email", "triggers", "محفزات"] },
      // Was the second tab of /dashboard/messages, behind a page that defaults to the outbound
      // log — so visitor mail had no sidebar entry and no command-palette hit. It is inbound
      // human correspondence, not send telemetry, and belongs beside the channels, not inside them.
      { key: "badges", title: "الشارات", href: "/dashboard/badges", icon: "award", keywords: ["badges"] },
      // The flat outbound send log (/dashboard/messages) is gone. Per-channel delivery detail lives
      // in البريد الإلكتروني / واتساب / الرسائل النصية above.
      { key: "messages", title: "الرسائل الواردة", href: "/dashboard/inbox", icon: "inbox", keywords: ["inbox", "inbound", "contact", "واردة", "زوار", "تواصل"], badge: "inboxUnread" },
    ],
  },
  {
    group: "التسويق",
    items: [
      // The overview, أداء الحملات and التوصيات pages were removed; what is left is the part of
      // التسويق that owns real, first-party data: our own links and our own tracking.
      { key: "referrals", title: "الروابط والإسناد", href: "/dashboard/marketing/attribution", icon: "link", keywords: ["attribution", "referrals", "links", "utm"] },
      { key: "pixels", title: "التتبع والتحويلات", href: "/dashboard/marketing/tracking", icon: "target", keywords: ["tracking", "pixels", "conversions", "capi"] },
    ],
  },
  {
    group: "ربط المنصات والإرسال",
    items: [
      // The overview, الحسابات الإعلانية, Webhooks and سجلات المنصات pages were removed. The three
      // pages left are the ones that configure something: pixels, providers, and the health check.
      { key: "platformConnections", title: "بكسلات التتبع", href: "/dashboard/platform-connections/tracking", icon: "radar", keywords: ["pixels", "meta", "tiktok", "snap"] },
      { key: "platformConnections", title: "مزودو التواصل والإرسال", href: "/dashboard/platform-connections/communication", icon: "server", keywords: ["providers", "twilio", "smtp", "whatsapp"] },
      { key: "platformConnections", title: "فحص الاتصال", href: "/dashboard/platform-connections/health", icon: "heartPulse", keywords: ["health", "status", "diagnostics"] },
      // No dedicated "telegram" permission key exists, and inventing one would need a matching
      // grant UI. It is an outbound integration, so it sits under platformConnections with the
      // other providers. Donation notifications depend on this page being configurable.
      { key: "platformConnections", title: "تيليجرام", href: "/dashboard/telegram", icon: "send", keywords: ["telegram", "bot", "notifications"] },
    ],
  },
  {
    group: "الإدارة",
    items: [
      { key: "team", title: "الفريق", href: "/dashboard/users/team", icon: "userCog", keywords: ["team", "staff", "permissions", "صلاحيات"] },
      { key: "generalSettings", title: "الإعدادات", href: "/dashboard/general/payment-gateways", icon: "settings", keywords: ["settings", "payment", "gateways", "stripe"] },
      { key: "logs", title: "سجلات النظام", href: "/dashboard/logs", icon: "scrollText", keywords: ["logs", "audit", "system"] },
    ],
  },
];

export const DASHBOARD_NAV_HREFS_ORDERED: string[] =
  DASHBOARD_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));

export function dashboardHrefToPermissionKey(
  href: string,
): DashboardPermissionKey | null {
  for (const g of DASHBOARD_NAV_GROUPS) {
    const found = g.items.find((i) => i.href === href);
    if (found) return found.key;
  }
  return null;
}

export function resolveActiveDashboardHref(pathname: string, hrefs: readonly string[]): string | null {
  return [...hrefs]
    .filter((href) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0] ?? null;
}

export const DASHBOARD_PERMISSION_ROWS: {
  key: DashboardPermissionKey;
  group: string;
  title: string;
}[] = [
  { key: "revenue", group: "الرئيسية", title: "اللوحة الرئيسية" },
  { key: "monthly", group: "الرئيسية", title: "التبرعات الشهرية" },
  // One grant for the whole finance desk: the statement importer and the donor-receipt queue.
  { key: "bankTransfers", group: "الرئيسية", title: "التحويلات البنكية وإيصالات التحويل" },
  { key: "donors", group: "الرئيسية", title: "المتبرعون" },
  { key: "campaigns", group: "محتوى الموقع", title: "المشاريع" },
  { key: "categories", group: "محتوى الموقع", title: "الحملات والدول" },
  { key: "blog", group: "محتوى الموقع", title: "المدونة" },
  // P3-2: these five keys were valid in DASHBOARD_PERMISSION_KEYS and enforced by the API
  // guards, but appeared in NO grant UI — so they could never actually be granted, and a user
  // holding one saw an empty sidebar and got bounced out of the dashboard. Now that their
  // pages are linked in the nav above, they must also be grantable.
  { key: "slides", group: "محتوى الموقع", title: "الشرائح" },
  { key: "ticker", group: "محتوى الموقع", title: "شريط التبرعات" },
  // One key for the whole "محتوى الموقع" group. Was enforced by every /api/* content route and
  // shown in the nav, but absent here — the same P3-2 shape: valid, checked, and ungrantable.
  { key: "siteContent", group: "محتوى الموقع", title: "محتوى الموقع (قصص، فيديو، تقارير، أسئلة…)" },
  // Group was "التشغيل / التواصل"; التشغيل no longer exists, so these two are plain التواصل.
  { key: "templates", group: "التواصل", title: "قوالب البريد والمحفّزات" },
  // The outbound send log page is gone; `messages` now grants the inbox and the per-channel
  // communication pages, which all check the same key.
  { key: "badges", group: "التواصل", title: "الشارات" },
  { key: "messages", group: "التواصل", title: "الرسائل الواردة والتواصل" },
  // No sidebar item carries `ads` any more — the marketing overview, performance and
  // recommendations pages were removed. The key stays grantable because the route guard still
  // maps the /dashboard/marketing prefix to it, so revoking it here would silently strand any
  // staffer whose only grant is `ads`.
  { key: "ads", group: "التسويق", title: "عرض صفحات التسويق" },
  { key: "referrals", group: "التسويق", title: "إدارة الروابط والإسناد" },
  { key: "pixels", group: "التسويق", title: "عرض التتبع والتحويلات" },
  { key: "platformConnections", group: "ربط المنصات والإرسال", title: "ربط المنصات والإرسال" },
  { key: "team", group: "الإدارة", title: "الفريق" },
  { key: "generalSettings", group: "الإدارة", title: "الإعدادات" },
  { key: "logs", group: "الإدارة", title: "السجلات المتقدمة" },
];

export const ACTION_PERMISSION_ROWS: {
  key: DashboardPermissionKey;
  title: string;
  description: string;
}[] = [
  {
    key: "reportsExport",
    title: "تصدير التقارير",
    description: "إظهار زر تصدير التقارير والسماح بتنزيل ملفات التقارير من لوحة التحكم.",
  },
  {
    key: "donationsEdit",
    title: "تعديل وإدارة التبرعات",
    description: "السماح بإدارة بيانات التبرعات من الجداول مع تحديث إجماليات المشاريع والحملات تلقائيًا.",
  },
];
