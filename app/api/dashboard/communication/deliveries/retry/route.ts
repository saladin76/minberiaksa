import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { resolveTriggerSendConfig } from "@/lib/events/dispatch";
import {
  retryDelivery,
  retryPreflight,
  listRetryCandidatePage,
  RETRY_BATCH_CAP,
  type RetryCandidateCursor,
  type RetryResult,
} from "@/lib/communication/delivery-retry-service";
import { isCommunicationChannel } from "@/lib/communication/communication-runtime-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Sends run one at a time; the cap keeps the worst case inside the platform's function ceiling. */
export const maxDuration = 300;

type RetryDateRange = { from?: Date; to: Date };

function parseRange(days: number | undefined, now = new Date()): RetryDateRange {
  return { ...(days && days > 0 ? { from: new Date(now.getTime() - days * 86_400_000) } : {}), to: now };
}

function parsePostedRange(value: unknown, days: number | undefined): RetryDateRange | null {
  if (value === undefined) return parseRange(days);
  if (!value || typeof value !== "object") return null;
  const range = value as { from?: unknown; to?: unknown };
  const to = typeof range.to === "string" ? new Date(range.to) : new Date(Number.NaN);
  const from = range.from == null ? undefined : typeof range.from === "string" ? new Date(range.from) : new Date(Number.NaN);
  if (!Number.isFinite(to.getTime()) || (from && !Number.isFinite(from.getTime())) || (from && from > to)) return null;
  return { ...(from ? { from } : {}), to };
}

/** What a bulk retry would do  read by the confirmation step before anything is sent. */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "messages");
    if (denied) return denied;

    const channel = request.nextUrl.searchParams.get("channel") ?? "";
    if (!isCommunicationChannel(channel)) {
      return NextResponse.json({ ok: false, error: "قناة غير معروفة" }, { status: 400 });
    }
    const daysParam = request.nextUrl.searchParams.get("days");
    const days = daysParam ? parseInt(daysParam) : undefined;

    const range = parseRange(days);
    const preflight = await retryPreflight({ channel, ...range });
    return NextResponse.json({
      ok: true,
      ...preflight,
      range: { from: range.from?.toISOString() ?? null, to: range.to.toISOString() },
    });
  } catch (error) {
    console.error("retry preflight failed", error);
    return NextResponse.json({ ok: false, error: "تعذّر حساب الرسائل القابلة لإعادة الإرسال" }, { status: 500 });
  }
}

/**
 * Execute a retry batch, streaming one NDJSON line per message.
 *
 * Streaming rather than a single JSON reply for two reasons. A batch of real provider calls can run
 * well past the point where a silent request looks hung  and worse, past an intermediary's idle
 * timeout, which would abandon the response while the sends carried on regardless. Emitting a line
 * per message keeps the connection alive and lets the dialog report progress truthfully, including
 * naming the message currently in flight.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  let body: { channel?: string; ids?: string[]; days?: number; after?: unknown; range?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400 });
  }

  const channel = body.channel ?? "";
  if (!isCommunicationChannel(channel)) {
    return NextResponse.json({ ok: false, error: "قناة غير معروفة" }, { status: 400 });
  }

  const range = parsePostedRange(body.range, body.days);
  if (!range) return NextResponse.json({ ok: false, error: "فترة إعادة الإرسال غير صالحة" }, { status: 400 });

  let after: RetryCandidateCursor | null = null;
  if (body.after !== undefined && body.after !== null) {
    if (!body.after || typeof body.after !== "object") {
      return NextResponse.json({ ok: false, error: "مؤشر الدفعة غير صالح" }, { status: 400 });
    }
    const candidate = body.after as { id?: unknown; createdAt?: unknown };
    const createdAt = typeof candidate.createdAt === "string" ? new Date(candidate.createdAt) : new Date(Number.NaN);
    if (typeof candidate.id !== "string" || candidate.id.length === 0 || candidate.id.length > 128 || !Number.isFinite(createdAt.getTime())) {
      return NextResponse.json({ ok: false, error: "مؤشر الدفعة غير صالح" }, { status: 400 });
    }
    after = { id: candidate.id, createdAt };
  }

  const candidates = await listRetryCandidatePage(
    { channel, ids: body.ids, ...range },
    after,
    RETRY_BATCH_CAP,
  );
  const ids = candidates.map((candidate) => candidate.id);

  const actor = session ? auditActorFromDashboardSession(session) : null;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        send({ type: "start", total: ids.length, cap: RETRY_BATCH_CAP });

        // Sender identity is resolved once for the whole batch rather than per message: it is two
        // queries, and re-running them 25 times would add latency to every send for no new answer.
        const config = await resolveTriggerSendConfig();
        const results: RetryResult[] = [];

        for (let i = 0; i < ids.length; i++) {
          let result: RetryResult;
          try {
            result = await retryDelivery(ids[i], { actorId: actor?.actorId ?? null, config });
          } catch (error) {
            console.error("retryDelivery threw", ids[i], error);
            // One bad row must not abort the batch  record it and keep going.
            result = {
              deliveryId: ids[i],
              code: "PROVIDER_REJECTED",
              ok: false,
              message: "خطأ غير متوقع أثناء الإرسال",
              detail: (error as Error).message,
            };
          }
          results.push(result);
          send({ type: "progress", index: i + 1, total: ids.length, result });
        }

        const sent = results.filter((r) => r.ok).length;
        const summary = {
          total: results.length,
          sent,
          failed: results.length - sent,
          byCode: results.reduce<Record<string, number>>((acc, r) => {
            acc[r.code] = (acc[r.code] ?? 0) + 1;
            return acc;
          }, {}),
        };

        if (actor && results.length > 0) {
          await writeAuditLog({
            ...actor,
            action: "COMMUNICATION_DELIVERY_RETRY",
            messageAr: `إعادة إرسال ${results.length} رسالة (${channel})  نجح ${sent}`,
            messageEn: `Retried ${results.length} ${channel} deliveries  ${sent} sent`,
            entityType: "CommunicationDelivery",
            metadata: { channel, ...summary, ids },
          });
        }

        const last = candidates.at(-1);
        send({
          type: "done",
          summary,
          results,
          nextCursor: last ? { id: last.id, createdAt: last.createdAt.toISOString() } : null,
          hasMore: candidates.length === RETRY_BATCH_CAP,
        });
      } catch (error) {
        console.error("retry batch failed", error);
        send({ type: "error", error: "تعذّر إكمال إعادة الإرسال" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Without this an nginx-style proxy buffers the whole body and the progress arrives at once.
      "X-Accel-Buffering": "no",
    },
  });
}
