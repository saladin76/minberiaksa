import type { Session } from "next-auth";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

export const INTEGRATION_SETTINGS_PERMISSIONS = {
  view: "platformConnections",
  test: "platformConnectionsTest",
  manage: "platformConnectionsManage",
  admin: "platformConnectionsAdmin",
} as const;

export function requireIntegrationSettingsView(session: Session | null) {
  return requireAdminOrDashboardPermission(session, INTEGRATION_SETTINGS_PERMISSIONS.view);
}
export function requireIntegrationSettingsTest(session: Session | null) {
  return requireAdminOrDashboardPermission(session, INTEGRATION_SETTINGS_PERMISSIONS.test);
}
export function requireIntegrationSettingsManage(session: Session | null) {
  return requireAdminOrDashboardPermission(session, INTEGRATION_SETTINGS_PERMISSIONS.manage);
}
export function requireIntegrationSettingsAdmin(session: Session | null) {
  return requireAdminOrDashboardPermission(session, INTEGRATION_SETTINGS_PERMISSIONS.admin);
}
