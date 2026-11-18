import "server-only";
import { randomBytes } from "node:crypto";
import tls from "node:tls";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { DEFAULT_SERVICES, isCycle, isIsoDate, nextRenewal, type ServiceRenewal } from "./shared";

const COLLECTION = "ServiceRenewal", LOG = "ServiceRenewalLog", META = "ServiceRenewalMeta";
const raw = (cmd: Record<string, unknown>) => prisma.$runCommandRaw(cmd as Prisma.InputJsonObject);
const rows = (r: unknown) => ((r as { cursor?: { firstBatch?: Record<string, unknown>[] } })?.cursor?.firstBatch ?? []);
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export type RenewalInput = Partial<Omit<ServiceRenewal, "id" | "auto" | "lastConfirmedAt">>;
/** Validated fields for a create or an edit; throws INVALID_<FIELD> on bad input. */
export function cleanRenewal(input: RenewalInput, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (k: keyof RenewalInput) => Object.prototype.hasOwnProperty.call(input, k);
  if (!partial || has("name")) { const v = text(input.name, 80); if (!v) throw new Error("INVALID_NAME"); out.name = v; }
  if (!partial || has("provider")) out.provider = text(input.provider, 80) ?? "";
  if (!partial || has("renewsAt")) { if (input.renewsAt != null && !isIsoDate(input.renewsAt)) throw new Error("INVALID_DATE"); out.renewsAt = input.renewsAt ?? null; }
  if (!partial || has("cycle")) { if (!isCycle(input.cycle)) throw new Error("INVALID_CYCLE"); out.cycle = input.cycle; }
  if (!partial || has("amount")) { const a = input.amount; if (a != null && !(typeof a === "number" && Number.isFinite(a) && a >= 0 && a < 10_000_000)) throw new Error("INVALID_AMOUNT"); out.amount = a ?? null; }
  if (!partial || has("currency")) { const c = typeof input.currency === "string" && input.currency.trim() ? input.currency.trim().toUpperCase() : null; if (c && !/^[A-Z]{3}$/.test(c)) throw new Error("INVALID_CURRENCY"); out.currency = c; }
  // Validate the raw text: a full card number must be refused, never trimmed down to four digits.
  if (!partial || has("cardLast4")) { const c = typeof input.cardLast4 === "string" ? input.cardLast4.trim() : ""; if (c && !/^\d{4}$/.test(c)) throw new Error("INVALID_CARD"); out.cardLast4 = c || null; }
  if (!partial || has("owner")) out.owner = text(input.owner, 80);
  if (!partial || has("billingUrl")) { const u = text(input.billingUrl, 300); if (u && !/^https:\/\/[^\s<>"']+$/.test(u)) throw new Error("INVALID_URL"); out.billingUrl = u; }
  if (!partial || has("notes")) out.notes = text(input.notes, 500);
  return out;
}

const toItem = (d: Record<string, unknown>): ServiceRenewal => ({
  id: String(d._id), name: String(d.name ?? ""), provider: String(d.provider ?? ""), renewsAt: isIsoDate(d.renewsAt) ? d.renewsAt : null,
  cycle: isCycle(d.cycle) ? d.cycle : "MONTHLY", amount: typeof d.amount === "number" ? d.amount : null, currency: typeof d.currency === "string" ? d.currency : null,
  cardLast4: typeof d.cardLast4 === "string" ? d.cardLast4 : null, owner: typeof d.owner === "string" ? d.owner : null,
  billingUrl: typeof d.billingUrl === "string" ? d.billingUrl : null, notes: typeof d.notes === "string" ? d.notes : null,
  lastConfirmedAt: typeof d.lastConfirmedAt === "string" ? d.lastConfirmedAt : null,
});
const log = (entry: Record<string, unknown>) => raw({ insert: LOG, documents: [{ at: new Date().toISOString(), ...entry }] });

/** The site's TLS certificate expiry, read from the live site (cached 12 h; null when unreadable). */
let sslCache: { until: number; date: string | null } | null = null;
export async function siteCertificateExpiry(host = "minberiaksa.org"): Promise<string | null> {
  if (sslCache && sslCache.until > Date.now()) return sslCache.date;
  const date = await new Promise<string | null>((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 5000 }, () => {
      const validTo = socket.getPeerCertificate()?.valid_to; socket.end();
      resolve(validTo ? new Date(validTo).toISOString().slice(0, 10) : null);
    });
    socket.on("error", () => resolve(null)); socket.on("timeout", () => { socket.destroy(); resolve(null); });
  });
  sslCache = { until: Date.now() + 12 * 3600_000, date };
  return date;
}

/** Fills the list once with the services the site depends on (never again, even if all are deleted). */
async function seedOnce(): Promise<void> {
  const res = (await raw({ update: META, updates: [{ q: { _id: "seed" }, upsert: true, u: { $setOnInsert: { at: new Date().toISOString() } } }] })) as { upserted?: unknown[] };
  if (!(Array.isArray(res.upserted) && res.upserted.length)) return;
  const now = new Date().toISOString();
  const docs = DEFAULT_SERVICES.filter((s) => !s.auto).map((s) => ({ _id: randomBytes(12).toString("hex"), ...s, renewsAt: null, amount: null, currency: null, cardLast4: null, owner: null, lastConfirmedAt: null, createdAt: now, updatedAt: now }));
  if (docs.length) await raw({ insert: COLLECTION, documents: docs });
}

export async function listRenewals(): Promise<ServiceRenewal[]> {
  await seedOnce();
  const items = rows(await raw({ find: COLLECTION, filter: { archived: { $ne: true } }, sort: { renewsAt: 1, name: 1 }, limit: 500 })).map(toItem);
  const ssl = DEFAULT_SERVICES.find((s) => s.auto === "SSL");
  if (ssl) items.push({ id: "ssl", name: ssl.name, provider: ssl.provider, renewsAt: await siteCertificateExpiry().catch(() => null), cycle: "ONCE", amount: null, currency: null, cardLast4: null, owner: null, billingUrl: null, notes: ssl.notes, auto: "SSL", lastConfirmedAt: null });
  return items;
}

const ID = /^[a-f\d]{24}$/;
export async function createRenewal(input: RenewalInput, by: string): Promise<string> {
  const now = new Date().toISOString(), id = randomBytes(12).toString("hex");
  await raw({ insert: COLLECTION, documents: [{ _id: id, ...cleanRenewal(input, false), lastConfirmedAt: null, createdAt: now, updatedAt: now }] });
  await log({ id, action: "CREATE", by });
  return id;
}
export async function updateRenewal(id: string, input: RenewalInput, by: string): Promise<void> {
  if (!ID.test(id)) throw new Error("INVALID_ID");
  const $set = { ...cleanRenewal(input, true), updatedAt: new Date().toISOString() };
  await raw({ update: COLLECTION, updates: [{ q: { _id: id }, u: { $set } }] });
  await log({ id, action: "UPDATE", by, fields: Object.keys($set) });
}
/** "Renewed successfully": the alert goes away and the date moves to the next cycle (ONCE: archived). */
export async function confirmRenewal(id: string, by: string, now = new Date()): Promise<string | null> {
  if (!ID.test(id)) throw new Error("INVALID_ID");
  const doc = rows(await raw({ find: COLLECTION, filter: { _id: id }, limit: 1 }))[0];
  if (!doc) throw new Error("NOT_FOUND");
  const item = toItem(doc);
  if (!item.renewsAt) throw new Error("INVALID_DATE");
  const next = nextRenewal(item.renewsAt, item.cycle, now);
  const at = now.toISOString();
  await raw({ update: COLLECTION, updates: [{ q: { _id: id }, u: { $set: { renewsAt: next, lastConfirmedAt: at, updatedAt: at, ...(next ? {} : { archived: true }) } } }] });
  await log({ id, action: "CONFIRM", by, from: item.renewsAt, to: next });
  return next;
}
export async function deleteRenewal(id: string, by: string): Promise<void> {
  if (!ID.test(id)) throw new Error("INVALID_ID");
  await raw({ update: COLLECTION, updates: [{ q: { _id: id }, u: { $set: { archived: true, updatedAt: new Date().toISOString() } } }] });
  await log({ id, action: "DELETE", by });
}
