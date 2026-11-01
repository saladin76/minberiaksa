import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { sessionHasDashboardPermission } from "@/lib/dashboard/permissions";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";
import { bankBalance, object, BANK_OPERATION_ERRORS, type BankDonation } from "@/lib/donations/bank-operations-core";
import { bankOperationsReady, callBankOperation } from "@/lib/donations/bank-operations-provider";
import { bankDonationSelect, executeBankAdjustment, inquireBankDonation, resolveBankAdjustment } from "@/lib/donations/bank-operations-service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = "sin1";
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const authorized = (session: Session | null) => session?.user?.id && (["revenue", "monthly", "referrals"] as const).some(permission => sessionHasDashboardPermission(session, permission));
function ensureReady(donation: BankDonation) { const ready = bankOperationsReady(donation); if (!ready.ready) throw new Error(ready.reason || "BANK_NOT_CONFIGURED"); }
function failure(error: unknown) { const code = error instanceof Error && BANK_OPERATION_ERRORS.includes(error.message) ? error.message : "BANK_OPERATIONS_UNAVAILABLE"; return response({ error: code }, code === "NOT_FOUND" ? 404 : code === "BANK_OPERATIONS_UNAVAILABLE" ? 503 : 409); }
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!authorized(session)) return response({ error: "Forbidden" }, session?.user ? 403 : 401);
  const { id } = await params; if (!/^[a-f0-9]{24}$/i.test(id)) return response({ error: "NOT_FOUND" }, 404);
  try {
    const donation = await prisma.donation.findUnique({ where: { id }, select: bankDonationSelect });
    if (!donation) return response({ error: "NOT_FOUND" }, 404);
    const balance = bankBalance(donation), ready = bankOperationsReady(donation);
    return response({ ...balance, sale: { provider: balance.sale.provider, orderId: balance.sale.orderId, reference: balance.sale.reference, amountMinor: balance.sale.amountMinor, currency: balance.sale.currency },
      canManage: session?.user?.role === "ADMIN", confirmed: Boolean(donation.paidAt && donation.status === "PAID"), ready, inquiry: object(donation.bankLastInquiry).lastCheck || donation.bankLastInquiry });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!authorized(session)) return response({ error: "Forbidden" }, session?.user ? 403 : 401);
  // Finance mutations accept JSON from the configured site origin only.
  if (request.headers.get("origin") !== paymentPublicOrigin(request.url) || !request.headers.get("content-type")?.includes("application/json")) return response({ error: "Forbidden" }, 403);
  const { id } = await params; if (!/^[a-f0-9]{24}$/i.test(id)) return response({ error: "NOT_FOUND" }, 404);
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_REQUEST");
    const actor = { id: session!.user!.id!, name: session!.user!.name || "Admin" };
    if (body.action === "INQUIRE") return response({ inquiry: await inquireBankDonation(prisma, id, actor, callBankOperation, ensureReady) });
    if (session?.user?.role !== "ADMIN") return response({ error: "Forbidden" }, 403);
    if (body.confirmed !== true) throw new Error("INVALID_REQUEST");
    if (body.action === "RECONCILE") {
      if (typeof body.operationId !== "string" || typeof body.succeeded !== "boolean" || typeof body.evidence !== "string" || body.evidence.trim().length < 12 || body.evidence.length > 1000) throw new Error("INVALID_REQUEST");
      return response({ operation: await resolveBankAdjustment(prisma, id, { operationId: body.operationId, succeeded: body.succeeded, evidence: body.evidence.trim() }, actor) });
    }
    if (!["VOID", "REFUND"].includes(body.action) || typeof body.currency !== "string" || typeof body.key !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(body.key) || typeof body.reason !== "string" || body.reason.trim().length < 5 || body.reason.length > 500) throw new Error("INVALID_REQUEST");
    const operation = await executeBankAdjustment(prisma, id, { action: body.action, key: body.key, amount: body.amount, currency: body.currency, reason: body.reason.trim() }, actor, callBankOperation, ensureReady);
    return response({ operation }, operation.state === "UNKNOWN" || operation.state === "PENDING" ? 202 : 200);
  } catch (error) { return failure(error); }
}
