import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveMetaWhatsappRuntimeConfig } from "@/lib/communication/runtime-config";
import { sendTemplateMessage } from "@/lib/communication/providers/meta-whatsapp/messages";
import { listApprovedTemplates } from "@/lib/communication/providers/meta-whatsapp/templates";
import { donorAuthenticationSender } from "@/lib/auth/donor-authentication-sender";
import { donationsStopped, gatewayOutage, gatewayRecovered, istanbulTime, type Attempt } from "@/lib/alerts/team-alert-rules";

export const dynamic = "force-dynamic";

/**
 * Team alerts on WhatsApp (every 10 minutes from the VPS cron). Sends the approved utility template
 * TEAM_ALERT_WHATSAPP_TEMPLATE (default team_alert_ar: {{1}} what, {{2}} since, {{3}} details) to every ADMIN with a
 * phone: once when a gateway goes down or donations stop, once when it recovers. Open incidents live in the
 * TeamAlertState collection, so nothing repeats every 10 minutes. TEAM_ALERTS_DISABLED=1 stops sending.
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || "";
  const got = request.headers.get("authorization") || "";
  const want = `Bearer ${secret}`;
  return Boolean(secret) && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

const GATEWAYS = ["ALBARAKA", "PAYFOR", "PAYPAL"] as const;
const NAMES: Record<string, string> = { ALBARAKA: "البركة", PAYFOR: "زراعات (PayFor)", PAYPAL: "PayPal" };
type Incident = { _id: string; since: string; openedAt: string };

async function openIncidents(): Promise<Incident[]> {
  const r = (await prisma.$runCommandRaw({ find: "TeamAlertState", filter: {} })) as unknown as { cursor?: { firstBatch?: Incident[] } };
  return r.cursor?.firstBatch ?? [];
}
async function setIncident(id: string, since: Date | null) {
  if (since) await prisma.$runCommandRaw({ update: "TeamAlertState", updates: [{ q: { _id: id }, u: { $set: { since: since.toISOString(), openedAt: new Date().toISOString() } }, upsert: true }] });
  else await prisma.$runCommandRaw({ delete: "TeamAlertState", deletes: [{ q: { _id: id }, limit: 1 }] });
}

async function sendToTeam(what: string, since: string, details: string): Promise<{ sent: number; failed: number; skipped?: string }> {
  if (process.env.TEAM_ALERTS_DISABLED === "1") return { sent: 0, failed: 0, skipped: "TEAM_ALERTS_DISABLED" };
  const runtime = await getActiveMetaWhatsappRuntimeConfig();
  const sender = await donorAuthenticationSender();
  const templateName = process.env.TEAM_ALERT_WHATSAPP_TEMPLATE || "team_alert_ar";
  const languageCode = process.env.TEAM_ALERT_WHATSAPP_LANGUAGE || "ar";
  if (!runtime.configured || !sender?.phoneNumberId || !sender.businessAccountId) return { sent: 0, failed: 0, skipped: "WHATSAPP_NOT_CONFIGURED" };
  const catalog = await listApprovedTemplates(sender.businessAccountId, runtime);
  if (!catalog.ok || !catalog.templates.some((t) => t.name === templateName && t.language === languageCode && t.status === "APPROVED")) return { sent: 0, failed: 0, skipped: "TEMPLATE_NOT_APPROVED" };
  const team = await prisma.user.findMany({ where: { role: "ADMIN", phone: { not: null } }, select: { phone: true } });
  let sent = 0, failed = 0;
  for (const m of team) {
    const to = String(m.phone ?? "").trim(); if (!to) continue;
    const r = await sendTemplateMessage({ phoneNumberId: sender.phoneNumberId, to, templateName, languageCode, components: [{ type: "body", parameters: [what, since, details].map((text) => ({ type: "text", text: text.slice(0, 300) })) }] }, runtime);
    if (r.ok) sent++; else failed++;
  }
  return { sent, failed };
}

async function run(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date(), from = new Date(now.getTime() - 12 * 3600_000);
  const rows = await prisma.donation.findMany({ where: { createdAt: { gte: from }, provider: { in: [...GATEWAYS] } }, select: { provider: true, status: true, providerProcReturnCode: true, providerErrorMessage: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 400 });
  const attempts: Attempt[] = rows.map((r) => ({ provider: String(r.provider), status: String(r.status), code: r.providerProcReturnCode ?? null, message: r.providerErrorMessage ?? null, at: r.createdAt }));
  const open = new Map((await openIncidents()).map((i) => [i._id, i]));
  const events: string[] = [];
  for (const g of GATEWAYS) {
    const id = `gateway:${g}`, o = gatewayOutage(attempts, g), was = open.get(id);
    if (o.down && !was) { const r = await sendToTeam(`بوابة ${NAMES[g]} ترفض الدفعات`, istanbulTime(o.since!), `${o.count} محاولات فاشلة متتالية · ${o.sample}`); await setIncident(id, o.since); events.push(`${id} opened ${JSON.stringify(r)}`); }
    else if (was && gatewayRecovered(attempts, g, new Date(was.since))) { const r = await sendToTeam(`✅ عادت بوابة ${NAMES[g]} تعمل`, istanbulTime(new Date(was.since)), "أول دفعة ناجحة بعد العطل"); await setIncident(id, null); events.push(`${id} recovered ${JSON.stringify(r)}`); }
  }
  const last = await prisma.donation.findFirst({ where: { paidAt: { not: null } }, orderBy: { paidAt: "desc" }, select: { paidAt: true } });
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);
  const usual = await prisma.donation.count({ where: { paidAt: { gte: new Date(weekAgo.getTime() - 2 * 3600_000), lt: weekAgo } } });
  const stopped = donationsStopped(last?.paidAt ?? null, now, usual), wasStopped = open.get("donations:stopped");
  if (stopped && !wasStopped) { const r = await sendToTeam("لا تبرعات مؤكدة منذ ساعتين", last?.paidAt ? istanbulTime(last.paidAt) : "—", `المعتاد في هذا الوقت: ${usual} تبرعاً`); await setIncident("donations:stopped", last?.paidAt ?? now); events.push(`donations:stopped opened ${JSON.stringify(r)}`); }
  else if (!stopped && wasStopped && last?.paidAt && last.paidAt > new Date(wasStopped.since)) { const r = await sendToTeam("✅ عادت التبرعات", istanbulTime(last.paidAt), "تبرع مؤكد جديد"); await setIncident("donations:stopped", null); events.push(`donations:stopped recovered ${JSON.stringify(r)}`); }
  return NextResponse.json({ ok: true, events, open: [...open.keys()] });
}

export async function GET(request: NextRequest) { return run(request); }
export async function POST(request: NextRequest) { return run(request); }
