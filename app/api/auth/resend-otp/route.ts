import { NextRequest, NextResponse } from "next/server";
import { canResendToken, createVerificationToken } from "@/lib/otp";
import { sendVerificationEmailViaRuntime } from "@/lib/communication/system-email";

export async function POST(req: NextRequest) {
  try {
    const { email, purpose = "VERIFY_EMAIL", locale = "en", callbackUrl } = await req.json();
    if (!email) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    const normalizedEmail = email.toLowerCase().trim();
    const { allowed, waitSeconds } = await canResendToken(normalizedEmail, purpose);
    if (!allowed) return NextResponse.json({ error: "RATE_LIMITED", waitSeconds }, { status: 429 });
    const token = await createVerificationToken(normalizedEmail, purpose);
    const baseUrl = process.env.NEXTAUTH_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const safeCallback = typeof callbackUrl === "string" && callbackUrl.startsWith("/") ? callbackUrl : "/";
    const safeLocale = typeof locale === "string" && /^[a-z]{2}$/.test(locale) ? locale : "en";
    const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(normalizedEmail)}&callbackUrl=${encodeURIComponent(safeCallback)}&locale=${safeLocale}`;
    const delivery = await sendVerificationEmailViaRuntime(normalizedEmail, verificationUrl, safeLocale);
    if (!delivery.ok) return NextResponse.json({ error: "EMAIL_NOT_SENT", reason: delivery.reason }, { status: 503 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[resend-otp]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
