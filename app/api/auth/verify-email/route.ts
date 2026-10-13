import { runAfterResponse } from "@/lib/events/after-response";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken, createAutoSignInToken } from "@/lib/otp";
import { dispatchEvent } from "@/lib/events/dispatch";
import { isValidLocale } from "@/lib/locales";
import { completionData, findUserByEmail, type AccountClaim } from "@/lib/users/account-claim";

function parseClaim(payload: string | null): AccountClaim | null {
  if (!payload) return null;
  try {
    const value = JSON.parse(payload) as Partial<AccountClaim>;
    return typeof value.passwordHash === "string" && typeof value.name === "string" ? (value as AccountClaim) : null;
  } catch {
    return null;
  }
}

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

  const user = await findUserByEmail(normalizedEmail);
  if (!user) return errorRedirect("invalid");

  // Mark email as verified  capture id for the event dispatch. A claim of an
  // imported account (`register`) is applied now that the inbox's owner has
  // clicked: the password is set if the account still has none, and the
  // details they typed fill only the fields that are empty.
  const data: Record<string, unknown> = { emailVerified: new Date() };
  const claim = parseClaim(result.payload);
  if (claim) {
    Object.assign(data, completionData(user, { name: claim.name, phone: claim.phone, birthdate: claim.birthdate, gender: claim.gender }));
    if (!user.password) data.password = claim.passwordHash;
  }
  if (!user.verifiedAt) data.verifiedAt = new Date();
  const verifiedUser = await prisma.user.update({
    where: { id: user.id },
    data,
    select: { id: true },
  });
  runAfterResponse(() => dispatchEvent("USER_REGISTERED", { userId: verifiedUser.id }));

  // Create a short-lived auto-sign-in token so the user lands signed in
  const autoToken = await createAutoSignInToken(normalizedEmail);

  const params = new URLSearchParams({
    token: autoToken,
    email: normalizedEmail,
    callbackUrl: callbackPath,
  });

  return NextResponse.redirect(`${baseUrl}/${locale}/auth/auto-signin?${params.toString()}`);
}
