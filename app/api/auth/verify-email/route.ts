import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken, createAutoSignInToken } from "@/lib/otp";
import { dispatchEvent } from "@/lib/events/dispatch";
import { isValidLocale } from "@/lib/locales";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const rawCallback = searchParams.get("callbackUrl");
  const rawLocale = searchParams.get("locale") ?? "en";

  const baseUrl =
    process.env.NEXTAUTH_URL ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  // Only allow relative paths to prevent open-redirect
  const callbackPath = rawCallback && rawCallback.startsWith("/") ? rawCallback : "/";
  const locale = isValidLocale(rawLocale) ? rawLocale : "en";

  const errorRedirect = (reason: string) =>
    NextResponse.redirect(
      `${baseUrl}/${locale}${callbackPath}${callbackPath.includes("?") ? "&" : "?"}verified=${reason}`
    );

  if (!token || !email) return errorRedirect("invalid");

  const normalizedEmail = decodeURIComponent(email).toLowerCase().trim();
  const result = await verifyToken(normalizedEmail, token, "VERIFY_EMAIL");

  if (!result.success) {
    return errorRedirect(result.error === "EXPIRED" ? "expired" : "invalid");
  }

  // Mark email as verified — capture id for the event dispatch
  const verifiedUser = await prisma.user.update({
    where: { email: normalizedEmail },
    data: { emailVerified: new Date() },
    select: { id: true },
  });
  void dispatchEvent("USER_REGISTERED", { userId: verifiedUser.id });

  // Create a short-lived auto-sign-in token so the user lands signed in
  const autoToken = await createAutoSignInToken(normalizedEmail);

  const params = new URLSearchParams({
    token: autoToken,
    email: normalizedEmail,
    callbackUrl: callbackPath,
  });

  return NextResponse.redirect(`${baseUrl}/${locale}/auth/auto-signin?${params.toString()}`);
}
