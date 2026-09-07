import type { Session } from "next-auth";
import type { Prisma } from "@prisma/client";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";

export type AuditStream = "TEAM" | "DONOR";

export function auditActorFromDashboardSession(session: Session): { actorId: string; actorName: string | null | undefined; actorRole: string } {
  const u = session.user!;
  return { actorId: u.id!, actorName: u.name, actorRole: u.role ?? "ADMIN" };
}

export function auditActorFromSiteSession(session: Session): { actorId: string; actorName: string | null | undefined; actorRole: string } {
  const u = session.user!;
  return { actorId: u.id!, actorName: u.name, actorRole: u.role ?? "DONOR" };
}

export function auditStreamForRole(role: string | null | undefined): AuditStream { return role === "DONOR" ? "DONOR" : "TEAM"; }

type WriteOpts = {
  actorId?: string | null;
  actorName?: string | null;
  actorRole: string;
  action: string;
  messageAr: string;
  messageEn?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  stream?: AuditStream;
};

export async function writeAuditLog(opts: WriteOpts): Promise<void> {
  try {
    const stream = opts.stream ?? auditStreamForRole(opts.actorRole);
    await prisma.auditLog.create({
      data: {
        actorId: opts.actorId ?? undefined,
        actorName: opts.actorName ?? undefined,
        actorRole: opts.actorRole,
        action: opts.action,
        messageAr: opts.messageAr,
        messageEn: opts.messageEn,
        entityType: opts.entityType,
        entityId: opts.entityId,
        metadata: opts.metadata ? opts.metadata as Prisma.InputJsonValue : undefined,
        stream,
      },
    });
  } catch (e) {
    console.error("writeAuditLog failed", e);
  }
}

/**
 * Same insert, but off the request's critical path.
 *
 * The audit row is one more round trip to Atlas, and this cluster answers in
 * ~0.5s — so `await writeAuditLog(...)` was adding half a second to every
 * create/update/delete the dashboard performs, purely to record something the
 * user never waits on. `after()` runs it once the response has been sent.
 *
 * Errors are already swallowed inside `writeAuditLog`, so this can never turn a
 * successful mutation into a failed one. Outside a request scope (scripts,
 * cron) `after()` throws, and we fall back to firing it directly.
 */
export function queueAuditLog(opts: WriteOpts): void {
  try {
    after(() => writeAuditLog(opts));
  } catch {
    void writeAuditLog(opts);
  }
}
