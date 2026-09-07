import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { safeCount } from "@/lib/dashboard/safe-count";
import { NOT_READ_WHERE, IS_READ_WHERE, NOT_REPLIED_WHERE } from "@/lib/messages/inbox-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/messages/unread-count — the number behind the sidebar badge.
 *
 * Split from the list endpoint on purpose: the sidebar polls this from every dashboard page, so
 * it must stay two counts and no document reads. `ok:false` is passed through rather than
 * collapsed to 0, so a failing read can be rendered as "no badge" instead of a confident
 * "nothing to answer".
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const [unread, pending] = await Promise.all([
    safeCount("inbox.badge.unread", () => prisma.message.count({ where: NOT_READ_WHERE })),
    safeCount("inbox.badge.pending", () =>
      prisma.message.count({ where: { AND: [IS_READ_WHERE, NOT_REPLIED_WHERE] } }),
    ),
  ]);

  return NextResponse.json(
    { count: unread.value, pending: pending.value, ok: unread.ok && pending.ok },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
