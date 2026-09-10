import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  FAQ_WITH_TRANSLATIONS_SELECT,
  buildFaqScalarPatch,
  parseFaqTranslations,
} from "@/lib/content/faq-write";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const faq = await prisma.faq.findUnique({
      where: { id },
      select: FAQ_WITH_TRANSLATIONS_SELECT,
    });
    if (!faq) return NextResponse.json({ error: "Faq not found" }, { status: 404 });

    return NextResponse.json(faq);
  } catch (error) {
    console.error("Error fetching faq:", error);
    return NextResponse.json({ error: "Failed to fetch faq" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const body = (await request.json()) as Record<string, unknown>;
    const patch = buildFaqScalarPatch(body);

    /* `translations` absent — which is what the list page toggle sends — must
       touch no translation rows at all. */
    const { write, clear } =
      body.translations === undefined
        ? { write: [], clear: [] as string[] }
        : parseFaqTranslations(body.translations);

    /* One nested write rather than an awaited upsert per locale: the form posts
       every locale at once, and sequential upserts inside an interactive
       transaction are what used to exceed the 5s transaction timeout here. */
    const full = await prisma.faq.update({
      where: { id },
      data: {
        ...patch,
        ...(write.length || clear.length
          ? {
              translations: {
                ...(write.length
                  ? {
                      upsert: write.map((t) => ({
                        where: { faqId_locale: { faqId: id, locale: t.locale } },
                        create: { locale: t.locale, question: t.question, answer: t.answer },
                        update: { question: t.question, answer: t.answer },
                      })),
                    }
                  : {}),
                ...(clear.length ? { deleteMany: { locale: { in: clear } } } : {}),
              },
            }
          : {}),
      },
      select: FAQ_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "FAQ_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} حدّث سؤالًا شائعًا: ${full.question}`,
      entityType: "Faq",
      entityId: full.id,
    });

    return NextResponse.json(full);
  } catch (error) {
    console.error("Error updating faq:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر تحديث السؤال") },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    /* Read the question before deleting: the audit entry is useless if it can
       only name an id that no longer resolves to anything. */
    const existing = await prisma.faq.findUnique({
      where: { id },
      select: { id: true, question: true },
    });
    if (!existing) return NextResponse.json({ error: "Faq not found" }, { status: 404 });

    // Translations cascade from the schema.
    await prisma.faq.delete({ where: { id } });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "FAQ_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف سؤالًا شائعًا: ${existing.question}`,
      entityType: "Faq",
      entityId: existing.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting faq:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حذف السؤال") },
      { status: 500 }
    );
  }
}
