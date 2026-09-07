import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  contentLocalizationPermissionForSection,
  parseContentLocalizationSection,
} from "@/lib/content-localization/access";

const DISABLED_MESSAGE =
  "Direct bulk proofreading is temporarily disabled pending reviewed preview workflow.";

/**
 * Direct AI-to-database bulk mutation is intentionally disabled.
 * It may only return in a separate reviewed workflow:
 * Preview -> Review -> Approve -> Apply -> Rollback.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const section = parseContentLocalizationSection(
    (body as { section?: unknown } | null)?.section,
  );
  if (!section) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(
    session,
    contentLocalizationPermissionForSection(section),
  );
  if (denied) return denied;

  // No database read/write and no OpenAI request may occur in this endpoint.
  return NextResponse.json(
    { ok: false, section, error: DISABLED_MESSAGE },
    { status: 409 },
  );
}
