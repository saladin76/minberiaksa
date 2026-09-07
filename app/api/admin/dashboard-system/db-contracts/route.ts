import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { getDashboardDbContractsSnapshot } from "@/lib/dashboard/db-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  // "operations" was removed with the التشغيل section, leaving this route pointing at a permission
  // key that no longer exists. This is an admin-only diagnostics endpoint, so it gates on the
  // closest surviving key rather than inventing a new one.
  const denied = requireAdminOrDashboardPermission(session, "logs");
  if (denied) return denied;

  return jsonNoStore({ ok: true, dbContracts: getDashboardDbContractsSnapshot() });
}
