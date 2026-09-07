import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOtpCode } from "@/lib/otp";
import { dispatchEvent } from "@/lib/events/dispatch";

export async function POST(req: NextRequest) {
  try {
    const { email, code, purpose = "VERIFY_EMAIL" } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    }

    const result = await verifyOtpCode(email.toLowerCase().trim(), code.trim(), purpose);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Mark email as verified
    const verifiedUser = await prisma.user.update({
      where: { email: email.toLowerCase().trim() },
      data: { emailVerified: new Date() },
      select: { id: true },
    });
    void dispatchEvent("USER_REGISTERED", { userId: verifiedUser.id });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[verify-otp]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
