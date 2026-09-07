import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { isValidLocale } from "@/lib/locales";

const bodySchema = z.object({
  locale: z.string().min(2).max(8),
  /** When true, only set preferredLang if it's currently missing.
   *  Used by the auto-sync hook for the very first visit, so we don't
   *  silently overwrite an explicit choice the user made earlier. */
  ifMissing: z.boolean().optional(),
});

/**
 * PATCH /api/users/me/preferred-lang
 * Body: { locale: SupportedLocale, ifMissing?: boolean }
 * Updates the authenticated user's `preferredLang`.
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const locale = parsed.data.locale.toLowerCase().trim();
  if (!isValidLocale(locale)) {
    return NextResponse.json({ error: "Unsupported locale" }, { status: 400 });
  }

  if (parsed.data.ifMissing) {
    const current = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferredLang: true },
    });
    if (current?.preferredLang) {
      return NextResponse.json({ preferredLang: current.preferredLang, changed: false });
    }
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: { preferredLang: locale },
    select: { preferredLang: true },
  });
  return NextResponse.json({ preferredLang: updated.preferredLang, changed: true });
}
