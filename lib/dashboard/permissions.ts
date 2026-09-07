import type { Session } from "next-auth";

type UserLike = { role?: string | null; dashboardPermissions?: string[] | null };

export const DASHBOARD_PERMISSION_KEYS = [
  "revenue", "monthly", "referrals", "bankTransfers", "donors", "team", "logs",
  "badges", "messages", "templates", "campaigns", "categories", "blog", "slides",
  // "operations" was removed with the التشغيل section. Any value still stored on a user row is
  // simply inert — it maps to no page and grants nothing.
  "ticker", "pixels", "ads", "platformConnections", "archive",
  "generalSettings", "platformConnectionsTest", "platformConnectionsManage",
  "platformConnectionsAdmin", "archiveUpload", "archiveDelete", "archiveAnalyze",
  "archiveDocuments", "donationsEdit", "reportsExport",
] as const;
export type DashboardPermissionKey = (typeof DASHBOARD_PERMISSION_KEYS)[number];

const ACTION_PERMISSION_KEYS: DashboardPermissionKey[] = [
  "platformConnectionsTest", "platformConnectionsManage", "platformConnectionsAdmin",
  "archiveUpload", "archiveDelete", "archiveAnalyze", "archiveDocuments",
  "donationsEdit", "reportsExport",
];
const LEGACY_USERS_KEY = "users";

export function isDashboardPermissionKey(k: string): k is DashboardPermissionKey {
  return (DASHBOARD_PERMISSION_KEYS as readonly string[]).includes(k);
}
function rawDashboardPermissions(user: UserLike | undefined): string[] {
  return Array.isArray(user?.dashboardPermissions)
    ? user.dashboardPermissions.filter((x): x is string => typeof x === "string")
    : [];
}
function hasLegacyUsersPermission(user: UserLike | undefined): boolean {
  return rawDashboardPermissions(user).includes(LEGACY_USERS_KEY);
}
function legacyUsersGrants(key: DashboardPermissionKey): boolean {
  return key === "donors" || key === "team" || key === "logs";
}
function integrationPermissionRank(key: DashboardPermissionKey): number {
  return key === "platformConnections" ? 1
    : key === "platformConnectionsTest" ? 2
    : key === "platformConnectionsManage" ? 3
    : key === "platformConnectionsAdmin" ? 4 : 0;
}
function hasIntegrationPermission(perms: readonly DashboardPermissionKey[], key: DashboardPermissionKey): boolean {
  const required = integrationPermissionRank(key);
  return required > 0 && perms.some((permission) => integrationPermissionRank(permission) >= required);
}

export function isDashboardRoutePermissionKey(key: string): key is DashboardPermissionKey {
  return isDashboardPermissionKey(key) && !ACTION_PERMISSION_KEYS.includes(key);
}
export function hasAnyDashboardRoutePermission(user: UserLike | undefined): boolean {
  const raw = rawDashboardPermissions(user);
  if (raw.includes(LEGACY_USERS_KEY)) return true;
  const perms = sanitizeDashboardPermissions(user?.dashboardPermissions);
  return perms.some(isDashboardRoutePermissionKey) || hasIntegrationPermission(perms, "platformConnections");
}
export function userHasDashboardPermission(user: UserLike | undefined, key: DashboardPermissionKey): boolean {
  if (!user?.role) return false;
  if (user.role === "ADMIN") return true;
  if (user.role !== "STAFF") return false;
  const perms = sanitizeDashboardPermissions(user.dashboardPermissions);
  if (perms.includes(key) || hasIntegrationPermission(perms, key)) return true;
  if ((key === "archiveUpload" || key === "archiveDelete" || key === "archiveAnalyze") && perms.includes("archive")) return true;
  return hasLegacyUsersPermission(user) && legacyUsersGrants(key);
}

export function userCanAccessDonorsManagement(user: UserLike | undefined): boolean { return userHasDashboardPermission(user, "donors"); }
export function userCanAccessTeamManagement(user: UserLike | undefined): boolean { return userHasDashboardPermission(user, "team"); }
export function userCanAccessLogs(user: UserLike | undefined): boolean { return userHasDashboardPermission(user, "logs"); }
export function userCanViewUserProfilesInDashboard(user: UserLike | undefined): boolean {
  return userHasDashboardPermission(user, "donors") || userHasDashboardPermission(user, "team") || hasLegacyUsersPermission(user);
}
export function userCanEditDonations(user: UserLike | undefined): boolean { return userHasDashboardPermission(user, "donationsEdit"); }
export function userCanExportReports(user: UserLike | undefined): boolean { return userHasDashboardPermission(user, "reportsExport"); }

const PATH_RULES: { prefix: string; key: DashboardPermissionKey }[] = [
  { prefix: "/dashboard/platform-connections", key: "platformConnections" },
  { prefix: "/dashboard/marketing/attribution", key: "referrals" },
  { prefix: "/dashboard/marketing/tracking", key: "pixels" },
  { prefix: "/dashboard/marketing/connections", key: "platformConnections" },
  { prefix: "/dashboard/marketing", key: "ads" },
  { prefix: "/dashboard/marketing-intelligence", key: "ads" },
  { prefix: "/dashboard/conversion-events", key: "pixels" },
  { prefix: "/dashboard/ads", key: "ads" },
  { prefix: "/dashboard/archive", key: "archive" },
  { prefix: "/dashboard/monthly", key: "monthly" },
  { prefix: "/dashboard/link-generator", key: "referrals" },
  { prefix: "/dashboard/referrals", key: "referrals" },
  { prefix: "/dashboard/bank-transfers", key: "bankTransfers" },
  { prefix: "/dashboard/users/donors", key: "donors" },
  { prefix: "/dashboard/users/team", key: "team" },
  { prefix: "/dashboard/logs", key: "logs" },
  { prefix: "/dashboard/badges", key: "badges" },
  { prefix: "/dashboard/communication", key: "messages" },
  // Without its own rule /dashboard/inbox fell through to the "/dashboard → revenue" catch-all,
  // so the route guard demanded `revenue` while the sidebar entry and the API both check
  // `messages` — a staffer granted the inbox was bounced straight back out of it.
  { prefix: "/dashboard/inbox", key: "messages" },
  { prefix: "/dashboard/templates", key: "templates" },
  { prefix: "/dashboard/campaigns", key: "campaigns" },
  { prefix: "/dashboard/categories", key: "categories" },
  { prefix: "/dashboard/blog", key: "blog" },
  { prefix: "/dashboard/slides", key: "slides" },
  { prefix: "/dashboard/ticker", key: "ticker" },
  { prefix: "/dashboard/pixels", key: "pixels" },
  { prefix: "/dashboard/donations", key: "revenue" },
  { prefix: "/dashboard/general", key: "generalSettings" },
  { prefix: "/dashboard", key: "revenue" },
];
export function pathToDashboardPermission(pathname: string): DashboardPermissionKey | null {
  if (!pathname.startsWith("/dashboard")) return null;
  for (const rule of [...PATH_RULES].sort((a, b) => b.prefix.length - a.prefix.length)) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + "/")) return rule.key;
  }
  return null;
}
export function userCanEnterDashboard(user: UserLike | undefined): boolean {
  return user?.role === "ADMIN" || (user?.role === "STAFF" && hasAnyDashboardRoutePermission(user));
}
export function sessionHasDashboardPermission(session: Session | null, key: DashboardPermissionKey): boolean {
  return userHasDashboardPermission(session?.user as UserLike | undefined, key);
}
export function sanitizeDashboardPermissions(raw: unknown): DashboardPermissionKey[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is DashboardPermissionKey => typeof x === "string" && isDashboardPermissionKey(x)))];
}
export function getFirstAllowedDashboardHref(user: UserLike | undefined, orderedHrefs: string[], hrefToKey: (href: string) => DashboardPermissionKey | null): string | null {
  for (const href of orderedHrefs) {
    const key = hrefToKey(href);
    if (key && userHasDashboardPermission(user, key)) return href;
  }
  return null;
}
