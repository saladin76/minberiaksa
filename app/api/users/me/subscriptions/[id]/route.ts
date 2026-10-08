import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";

// Managing recurring billing requires an authorized institution operator.
// Donors may view their records and can request cessation through support;
// this legacy assistant endpoint cannot change any plan or billing authority.
export async function PATCH() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    error: "Recurring donations are managed by the institution. To reduce or stop a donation, please contact support. You can also revoke payment authorization with your payment provider.",
    code: "INSTITUTION_MANAGED",
  }, { status: 403 });
}
