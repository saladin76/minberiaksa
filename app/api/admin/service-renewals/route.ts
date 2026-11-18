import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminSession } from "@/lib/dashboard/api-auth";
import { confirmRenewal, createRenewal, deleteRenewal, listRenewals, updateRenewal, type RenewalInput } from "@/lib/service-renewals/store";
import { dueRenewals } from "@/lib/service-renewals/shared";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (e: unknown) => {
  const code = e instanceof Error && /^(INVALID_[A-Z]+|NOT_FOUND)$/.test(e.message) ? e.message : "RENEWALS_UNAVAILABLE";
  return reply({ error: code }, code === "RENEWALS_UNAVAILABLE" ? 503 : 400);
};
async function admin() {
  const session = await getServerSession(authOptions);
  return { by: session?.user?.email || session?.user?.name || "admin", denied: requireAdminSession(session) };
}

/** Admins only. ?alerts=1 returns only what needs attention now (for the dashboard banner). */
export async function GET(request: NextRequest) {
  const { denied } = await admin();
  if (denied) return denied;
  try {
    const items = await listRenewals();
    return reply(request.nextUrl.searchParams.get("alerts") ? { alerts: dueRenewals(items) } : { items });
  } catch (e) { return fail(e); }
}
export async function POST(request: NextRequest) {
  const { by, denied } = await admin();
  if (denied) return denied;
  try { return reply({ id: await createRenewal((await request.json().catch(() => ({}))) as RenewalInput, by) }); } catch (e) { return fail(e); }
}
export async function PATCH(request: NextRequest) {
  const { by, denied } = await admin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as RenewalInput & { id?: string; confirm?: boolean };
  try {
    if (body.confirm === true) return reply({ next: await confirmRenewal(String(body.id ?? ""), by) });
    const { id, confirm: _c, ...fields } = body; void _c;
    await updateRenewal(String(id ?? ""), fields, by);
    return reply({ ok: true });
  } catch (e) { return fail(e); }
}
export async function DELETE(request: NextRequest) {
  const { by, denied } = await admin();
  if (denied) return denied;
  try { await deleteRenewal(request.nextUrl.searchParams.get("id") ?? "", by); return reply({ ok: true }); } catch (e) { return fail(e); }
}
