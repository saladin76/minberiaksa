import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { track as vercelTrack } from "@vercel/analytics/server";
import { prisma } from "@/lib/prisma";
import { createVerificationToken } from "@/lib/otp";
import { sendVerificationEmailViaRuntime } from "@/lib/communication/system-email";
import { inferLocaleFromRequest } from "@/lib/preferred-lang";
import { findUserByEmail, type AccountClaim } from "@/lib/users/account-claim";

export async function POST(req: NextRequest) {
  try {
    const { firstName, lastName, phone, dateOfBirth, gender, email, password, locale, callbackUrl } = await req.json();
    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !password) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "PASSWORD_TOO_SHORT" }, { status: 400 });
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await findUserByEmail(normalizedEmail);
    const hashed = await bcrypt.hash(password, 12);
    const preferredLang = inferLocaleFromRequest(req, locale);
    const name = `${firstName.trim()} ${lastName.trim()}`;
    let claim: AccountClaim | null = null;
    if (existing) {
      /* A donor imported from the old site has this email but no way in: no
         password, no Google/Facebook account. Registering is how they claim
         it. Nothing is written to their record yet  the password and the
         details wait on the verification token and are applied only once the
         owner of the inbox clicks the link, so typing someone's email here
         changes nothing on their account. */
      const linked = await prisma.account.count({ where: { userId: existing.id } });
      if (existing.password || linked > 0) return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
      claim = { passwordHash: hashed, name, phone: phone?.trim() || null, birthdate: dateOfBirth?.trim() || null, gender: gender?.trim() || null };
    } else {
      await prisma.user.create({ data: { name, email: normalizedEmail, password: hashed, phone: phone?.trim() || null, birthdate: dateOfBirth?.trim() || null, gender: gender?.trim() || null, role: "DONOR", emailVerified: null, preferredLang } });
    }
    const token = await createVerificationToken(normalizedEmail, "VERIFY_EMAIL", undefined, claim ? JSON.stringify(claim) : null);
    const baseUrl = process.env.NEXTAUTH_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const safeCallback = typeof callbackUrl === "string" && callbackUrl.startsWith("/") ? callbackUrl : "/";
    const safeLocale = typeof locale === "string" && /^[a-z]{2}$/.test(locale) ? locale : "en";
    const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(normalizedEmail)}&callbackUrl=${encodeURIComponent(safeCallback)}&locale=${safeLocale}`;
    const delivery = await sendVerificationEmailViaRuntime(normalizedEmail, verificationUrl, safeLocale);
    if (!delivery.ok) console.error("[register] verification email not sent", { reason: delivery.reason });
    try { await vercelTrack("user_registered_server", { method: "credentials", locale: preferredLang ?? locale ?? "en", has_phone: !!(phone && phone.trim()) }); }
    catch (err) { console.error("Vercel user_registered_server track failed", err); }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
