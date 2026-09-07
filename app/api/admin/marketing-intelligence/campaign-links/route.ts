import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  campaignLinkObjectIdFilter,
  createOrUpdateCampaignLink,
  ensureCampaignLinkIndexes,
  listCampaignLinks,
  parseCampaignLinkStatusFilter,
  readCampaignLinkPayload,
  readString,
  type CampaignLinkStatus,
  type JsonMap,
} from "@/lib/marketing/campaign-links/campaign-link-registry-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function numberParam(request: NextRequest, key: string, fallback: number, min: number, max: number) {
  const raw = Number(request.nextUrl.searchParams.get(key));
  return Number.isFinite(raw) ? Math.max(min, Math.min(max, Math.floor(raw))) : fallback;
}
function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}
async function requireLinksAccess() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "referrals");
  return { session, denied };
}

export async function GET(request: NextRequest) {
  const { denied } = await requireLinksAccess();
  if (denied) return denied;
  const limit = numberParam(request, "limit", 50, 1, 200);
  const platform = readString(request.nextUrl.searchParams.get("platform"));
  const status = parseCampaignLinkStatusFilter(request.nextUrl.searchParams.get("status"));
  const links = await listCampaignLinks({ limit, platform, status });
  return jsonNoStore({ ok: true, status, links });
}

export async function POST(request: NextRequest) {
  const { session, denied } = await requireLinksAccess();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as JsonMap;
  const payload = readCampaignLinkPayload(body);
  if (!payload.url) return jsonNoStore({ ok: false, error: "missing url" }, { status: 400 });
  if (!payload.platform) return jsonNoStore({ ok: false, error: "missing platform" }, { status: 400 });
  const link = await createOrUpdateCampaignLink({
    name: payload.name ?? payload.utmCampaign ?? payload.campaignId ?? "Marketing link",
    platform: payload.platform,
    channel: payload.channel ?? payload.platform,
    url: payload.url,
    basePath: payload.basePath ?? null,
    utmSource: payload.utmSource ?? null,
    utmMedium: payload.utmMedium ?? null,
    utmCampaign: payload.utmCampaign ?? null,
    utmId: payload.utmId ?? null,
    utmContent: payload.utmContent ?? null,
    campaignId: payload.campaignId ?? null,
    adGroupId: payload.adGroupId ?? null,
    adsetId: payload.adsetId ?? null,
    adId: payload.adId ?? null,
    audienceSegment: payload.audienceSegment ?? null,
    messageVariant: payload.messageVariant ?? null,
    targetCountry: payload.targetCountry ?? null,
    locale: payload.locale ?? null,
    objective: payload.objective ?? null,
    internalNotes: payload.internalNotes ?? null,
    createdBy: session?.user?.id ?? null,
    raw: payload.raw ?? body,
  });
  return jsonNoStore({ ok: true, link });
}

export async function PATCH(request: NextRequest) {
  const { session, denied } = await requireLinksAccess();
  if (denied) return denied;
  await ensureCampaignLinkIndexes();
  const body = (await request.json().catch(() => ({}))) as JsonMap;
  const id = readString(body.id);
  const action = readString(body.action)?.toUpperCase();
  if (!id) return jsonNoStore({ ok: false, error: "missing id" }, { status: 400 });
  const filter = campaignLinkObjectIdFilter(id) ?? { urlHash: id };
  if (action === "UPDATE") return updateLink(filter, body, session?.user?.id ?? null, readString(session?.user?.name));
  if (action === "ARCHIVE") return setLinkStatus(filter, "ARCHIVED", session?.user?.id ?? null, readString(session?.user?.name));
  if (action === "DELETE") return setLinkStatus(filter, "DELETED", session?.user?.id ?? null, readString(session?.user?.name));
  if (action === "RESTORE") return setLinkStatus(filter, "ACTIVE", session?.user?.id ?? null, readString(session?.user?.name));
  return jsonNoStore({ ok: false, error: "invalid action" }, { status: 400 });
}

async function updateLink(filter: JsonMap, body: JsonMap, userId: string | null, userName: string | null) {
  const payload = readCampaignLinkPayload(body);
  const editable: JsonMap = { updatedAt: new Date(), editedAt: new Date(), editedBy: userId, editedByName: userName };
  if (payload.name !== undefined) editable.name = payload.name || "Marketing link";
  if (payload.platform !== undefined) editable.platform = payload.platform;
  if (payload.channel !== undefined) editable.channel = payload.channel;
  if (payload.utmCampaign !== undefined) editable.utmCampaign = payload.utmCampaign ?? null;
  if (payload.utmId !== undefined) editable.utmId = payload.utmId ?? null;
  if (payload.utmContent !== undefined) editable.utmContent = payload.utmContent ?? null;
  if (payload.campaignId !== undefined) editable.campaignId = payload.campaignId ?? null;
  if (payload.adGroupId !== undefined) editable.adGroupId = payload.adGroupId ?? null;
  if (payload.adsetId !== undefined) editable.adsetId = payload.adsetId ?? null;
  if (payload.adId !== undefined) editable.adId = payload.adId ?? null;
  if (payload.audienceSegment !== undefined) editable.audienceSegment = payload.audienceSegment ?? null;
  if (payload.messageVariant !== undefined) editable.messageVariant = payload.messageVariant ?? null;
  if (payload.targetCountry !== undefined) editable.targetCountry = payload.targetCountry ?? null;
  if (payload.objective !== undefined) editable.objective = payload.objective ?? null;
  if (payload.internalNotes !== undefined) editable.internalNotes = payload.internalNotes ?? null;
  const result = await prisma.$runCommandRaw({ update: "MarketingCampaignLink", updates: [{ q: filter, u: { $set: editable }, multi: false }] }) as JsonMap;
  return jsonNoStore({ ok: true, matched: result.n ?? 0, action: "UPDATE" });
}

async function setLinkStatus(filter: JsonMap, status: CampaignLinkStatus, userId: string | null, userName: string | null) {
  const update: JsonMap = { status, updatedAt: new Date(), reviewedBy: userId, reviewedByName: userName };
  if (status === "ARCHIVED") update.archivedAt = new Date();
  if (status === "DELETED") update.deletedAt = new Date();
  if (status === "ACTIVE") { update.restoredAt = new Date(); update.archivedAt = null; update.deletedAt = null; }
  const result = await prisma.$runCommandRaw({ update: "MarketingCampaignLink", updates: [{ q: filter, u: { $set: update }, multi: false }] }) as JsonMap;
  return jsonNoStore({ ok: true, matched: result.n ?? 0, status });
}
