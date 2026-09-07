import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import {
  writeAuditLog,
  auditActorFromSiteSession,
  auditStreamForRole,
} from "@/lib/audit-log";

/**
 * POST /api/users/[id]/password
 *
 * Change a user's password.
 *  - The signed-in user can only change their own password.
 *  - Requires `currentPassword` for accounts that have one (credentials auth).
 *    OAuth-only accounts (no password set) can set one without proof — that
 *    transition turns them into a hybrid account they can log in with either way.
 *  - Enforces minimum length 8 and requires `newPassword !== currentPassword`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.id !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters." },
        { status: 400 }
      );
    }
    if (newPassword.length > 200) {
      return NextResponse.json(
        { error: "New password is too long (max 200 chars)." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, password: true, name: true, email: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Credentials-auth users must prove they know the existing password.
    if (user.password) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required." },
          { status: 400 }
        );
      }
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        return NextResponse.json(
          { error: "Current password is incorrect." },
          { status: 400 }
        );
      }
      const sameAsBefore = await bcrypt.compare(newPassword, user.password);
      if (sameAsBefore) {
        return NextResponse.json(
          { error: "Please choose a different password." },
          { status: 400 }
        );
      }
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id },
      data: { password: hashed },
    });

    const actor = auditActorFromSiteSession(session);
    await writeAuditLog({
      ...actor,
      action: "USER_PASSWORD_CHANGE",
      messageAr: `${user.name ?? user.email ?? "مستخدم"} غيّر كلمة المرور الخاصة به`,
      messageEn: `${user.name ?? user.email ?? "user"} changed their password`,
      entityType: "User",
      entityId: id,
      stream: auditStreamForRole(actor.actorRole),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("password change error:", err);
    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 }
    );
  }
}
