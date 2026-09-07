import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import type { DashboardPermissionKey } from "@/lib/dashboard/permissions";

export function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

export async function requireArchiveApiAccess() {
  const session = await getServerSession(authOptions);
  return {
    session,
    denied: requireAdminOrDashboardPermission(session, "archive"),
  };
}

export async function requireArchiveActionAccess(key: DashboardPermissionKey) {
  const session = await getServerSession(authOptions);
  return {
    session,
    denied: requireAdminOrDashboardPermission(session, key),
  };
}

export async function requireArchiveUploadedFileListAccess(category: string | null | undefined) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, category === "DOCUMENTS" ? "archiveDocuments" : "archive");
  return { session, denied };
}

export async function readJson(request: Request) {
  return request.json().catch(() => ({}));
}

export function dashboardUser(session: Awaited<ReturnType<typeof getServerSession>>) {
  return session?.user?.email || session?.user?.name || "dashboard-user";
}
