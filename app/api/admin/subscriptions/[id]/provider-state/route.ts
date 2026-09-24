import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { checkPlanProviderState } from "@/lib/donations/subscription-provider-control";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/subscriptions/[id]/provider-state — read-only.
 *
 * Compares the plan's local status with what the payment provider says, so the
 * monthly dashboard can show a SYNC ERROR instead of trusting either side.
 * Nothing is changed here; fixing a mismatch is a deliberate action.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "monthly");
  if (denied) return denied;

  const { id } = await params;
  const plan = await prisma.subscription.findUnique({
    where: { id },
    select: { id: true, status: true, provider: true, stripeSubscriptionId: true, payforToken: true },
  });
  if (!plan) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });

  return NextResponse.json(await checkPlanProviderState(plan));
}
