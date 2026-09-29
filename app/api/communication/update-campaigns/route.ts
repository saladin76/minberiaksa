import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { listChannelTemplates } from "@/lib/communication/template-compat";
import { AUDIENCE_SELECTION_MAX } from "@/lib/communication/audience-limits";
import {
  createUpdateEmailCampaign,
  listCampaignDonorIds,
  loadUpdateSource,
  usesUpdateVariables,
} from "@/lib/communication/update-campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Campaign-update → email campaign (see lib/communication/update-campaign.ts).
 *
 * GET  ?updateId=…  what the wizard needs to set it up: the update, how many
 *      donors will receive it, and the email templates  those that place
 *      {{update.*}} variables flagged and listed first.
 * POST { updateId, templateId, name }  creates the donors' audience list and
 *      the DRAFT email campaign. Sending is the usual approved step on the
 *      campaigns page.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const updateId = request.nextUrl.searchParams.get("updateId") ?? "";
  const source = await loadUpdateSource(updateId);
  if (!source) return NextResponse.json({ ok: false, error: "التحديث غير موجود." }, { status: 404 });

  const [donorIds, templates] = await Promise.all([listCampaignDonorIds(source.campaign.id), listChannelTemplates("EMAIL")]);
  const docs = await prisma.emailTemplate.findMany({
    where: { id: { in: templates.map((t) => t.id) } },
    select: { id: true, subject: true, document: true, translations: true },
  });
  const updateReady = new Set(docs.filter((d) => usesUpdateVariables([d.subject, d.document, d.translations])).map((d) => d.id));
  const flagged = templates
    .map((t) => ({ ...t, usesUpdate: updateReady.has(t.id) }))
    .sort((a, b) => Number(b.usesUpdate) - Number(a.usesUpdate));

  return NextResponse.json({
    ok: true,
    update: {
      id: source.id,
      title: source.title,
      description: source.description,
      image: source.image,
      videoUrl: source.videoUrl,
      createdAt: source.createdAt.toISOString(),
      campaignId: source.campaign.id,
      campaignTitle: source.campaign.title,
    },
    donors: donorIds.length,
    audienceCap: AUDIENCE_SELECTION_MAX,
    templates: flagged,
  });
}

const createSchema = z.object({
  updateId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  templateId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  name: z.string().trim().min(1).max(160),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "بيانات غير صالحة." }, { status: 400 });

  const result = await createUpdateEmailCampaign(parsed.data, auditActorFromDashboardSession(session!));
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json(result, { status: 201 });
}
