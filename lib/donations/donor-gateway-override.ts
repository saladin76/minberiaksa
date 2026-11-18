import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import type { CountryGatewayRule, DonorGatewayOverride } from "./payment-routing";

/**
 * Per-donor payment gateway, pinned by an administrator (owner request, 2026-11-17).
 * Applies to new-card one-time donations through the central router
 * (payment-routing-server.ts), so the checkout preview and the order writer agree
 * and the decision is frozen on the donation with reason DONOR_OVERRIDE.
 * Every change is kept in DonorGatewayOverrideLog.
 */
export const OVERRIDES = "DonorGatewayOverride", OVERRIDE_LOG = "DonorGatewayOverrideLog", COUNTRY_RULES = "GatewayCountryRule", ROUTING_META = "GatewayRoutingMeta";
export type OverrideChoice = DonorGatewayOverride | "AUTO";
export type MatchBy = CountryGatewayRule["matchBy"];
export type OverrideRow = { userId: string; gateway: DonorGatewayOverride; reason: string; setBy: string; setAt: string; phoneKey: string | null };
export type CountryRuleRow = CountryGatewayRule & { reason: string; setBy: string; setAt: string };
export type OverrideLogRow = { at: string; scope: "DONOR" | "COUNTRY"; userId?: string; country?: string; from: OverrideChoice; to: OverrideChoice; matchBy?: MatchBy; reason: string; by: string };

const raw = (cmd: Record<string, unknown>) => prisma.$runCommandRaw(cmd as Prisma.InputJsonObject);
const rows = (r: unknown) => ((r as { cursor?: { firstBatch?: Record<string, unknown>[] } })?.cursor?.firstBatch ?? []);
const isObjectId = (v: unknown): v is string => typeof v === "string" && /^[a-f\d]{24}$/i.test(v);
const isGateway = (v: unknown): v is DonorGatewayOverride => v === "PAYFOR" || v === "ALBARAKA";
const isMatchBy = (v: unknown): v is MatchBy => v === "ANY" || v === "IP" || v === "PHONE";
export const isCountryCode = (v: unknown): v is string => typeof v === "string" && /^[A-Z]{2}$/.test(v);

/** Digits with the country code ("+90 555…", "0090555…", Arabic digits → "90555…"). */
export function phoneKey(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 80) return null;
  const digits = value.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776)).replace(/\D/g, "").replace(/^00/, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

type Table = { expires: number; byUser: Map<string, DonorGatewayOverride>; byPhone: Map<string, DonorGatewayOverride>; countryRules: CountryGatewayRule[]; saudiMigrated: boolean };
let table: Table | null = null;
export function clearDonorOverrideCache(): void { table = null; }

async function loadTable(): Promise<Table> {
  if (table && table.expires > Date.now()) return table;
  const [docs, rules, meta] = await Promise.all([
    raw({ find: OVERRIDES, filter: {}, limit: 5000, maxTimeMS: 2000 }),
    raw({ find: COUNTRY_RULES, filter: {}, limit: 300, maxTimeMS: 2000 }),
    raw({ find: ROUTING_META, filter: { _id: "saudiMigration" }, limit: 1, maxTimeMS: 2000 }),
  ]);
  const byUser = new Map<string, DonorGatewayOverride>(), byPhone = new Map<string, DonorGatewayOverride>();
  for (const d of rows(docs)) {
    if (!isGateway(d.gateway)) continue;
    byUser.set(String(d._id), d.gateway);
    if (typeof d.phoneKey === "string" && d.phoneKey) byPhone.set(d.phoneKey, d.gateway);
  }
  const countryRules = rows(rules).filter((r) => isCountryCode(r._id) && isGateway(r.gateway) && isMatchBy(r.matchBy))
    .map((r) => ({ country: String(r._id), gateway: r.gateway as DonorGatewayOverride, matchBy: r.matchBy as MatchBy }));
  table = { expires: Date.now() + 30_000, byUser, byPhone, countryRules, saudiMigrated: rows(meta).length > 0 };
  return table;
}

/**
 * One-time move of the old "Saudi visitors → PayFor" setting into the country list (owner, 2026-11-17).
 * Idempotent: the marker is written with $setOnInsert, and only the first writer creates the SA rule,
 * and only if the old setting was on. Afterwards the list is the only source of truth.
 */
async function migrateSaudiSetting(saudiSettingEnabled: boolean): Promise<void> {
  const at = new Date().toISOString();
  const res = (await raw({ update: ROUTING_META, updates: [{ q: { _id: "saudiMigration" }, upsert: true, u: { $setOnInsert: { at, saudiSettingEnabled } } }] })) as { upserted?: unknown[] };
  if (!(Array.isArray(res.upserted) && res.upserted.length > 0) || !saudiSettingEnabled) return;
  const reason = "Moved from the Saudi routing setting";
  await raw({ update: COUNTRY_RULES, updates: [{ q: { _id: "SA" }, upsert: true, u: { $setOnInsert: { gateway: "PAYFOR", matchBy: "ANY", reason, setBy: "system", setAt: at } } }] });
  await raw({ insert: OVERRIDE_LOG, documents: [{ at, scope: "COUNTRY", country: "SA", from: "AUTO", to: "PAYFOR", matchBy: "ANY", reason, by: "system" }] });
}

/**
 * Everything the router needs, from memory. null on any problem, which means "route as before"
 * (the old Saudi setting keeps working until the move has happened).
 */
export async function routingPreferences(input: { userId?: string | null; phone?: unknown; saudiSettingEnabled: boolean }): Promise<{ donorOverride: DonorGatewayOverride | null; countryRules: CountryGatewayRule[]; saudiMigrated: true; needsIp: boolean } | null> {
  try {
    let t = await loadTable();
    if (!t.saudiMigrated) { await migrateSaudiSetting(input.saudiSettingEnabled); clearDonorOverrideCache(); t = await loadTable(); }
    if (!t.saudiMigrated) return null;
    const key = phoneKey(input.phone);
    const donorOverride = (input.userId && t.byUser.get(input.userId)) || (key && t.byPhone.get(key)) || null;
    return { donorOverride, countryRules: t.countryRules, saudiMigrated: true, needsIp: t.countryRules.some((r) => r.matchBy !== "PHONE") };
  } catch {
    return null;
  }
}

export async function setDonorGatewayOverride(input: { userId: string; choice: OverrideChoice; reason: string; by: string }): Promise<{ from: OverrideChoice; to: OverrideChoice }> {
  if (!isObjectId(input.userId)) throw new Error("INVALID_DONOR");
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, phone: true } });
  if (!user) throw new Error("DONOR_NOT_FOUND");
  const current = rows(await raw({ find: OVERRIDES, filter: { _id: input.userId }, limit: 1 }))[0];
  const from: OverrideChoice = isGateway(current?.gateway) ? current.gateway : "AUTO";
  const at = new Date().toISOString();
  if (input.choice === "AUTO") await raw({ delete: OVERRIDES, deletes: [{ q: { _id: input.userId }, limit: 1 }] });
  else await raw({ update: OVERRIDES, updates: [{ q: { _id: input.userId }, upsert: true, u: { $set: { gateway: input.choice, reason: input.reason, setBy: input.by, setAt: at, phoneKey: phoneKey(user.phone) } } }] });
  await raw({ insert: OVERRIDE_LOG, documents: [{ at, scope: "DONOR", userId: input.userId, from, to: input.choice, reason: input.reason, by: input.by }] });
  clearDonorOverrideCache();
  return { from, to: input.choice };
}

export async function setCountryGatewayRule(input: { country: string; choice: OverrideChoice; matchBy: MatchBy; reason: string; by: string }): Promise<{ from: OverrideChoice; to: OverrideChoice }> {
  if (!isCountryCode(input.country) || !isMatchBy(input.matchBy)) throw new Error("INVALID_COUNTRY");
  const current = rows(await raw({ find: COUNTRY_RULES, filter: { _id: input.country }, limit: 1 }))[0];
  const from: OverrideChoice = isGateway(current?.gateway) ? current.gateway : "AUTO";
  const at = new Date().toISOString();
  if (input.choice === "AUTO") await raw({ delete: COUNTRY_RULES, deletes: [{ q: { _id: input.country }, limit: 1 }] });
  else await raw({ update: COUNTRY_RULES, updates: [{ q: { _id: input.country }, upsert: true, u: { $set: { gateway: input.choice, matchBy: input.matchBy, reason: input.reason, setBy: input.by, setAt: at } } }] });
  await raw({ insert: OVERRIDE_LOG, documents: [{ at, scope: "COUNTRY", country: input.country, from, to: input.choice, matchBy: input.matchBy, reason: input.reason, by: input.by }] });
  clearDonorOverrideCache();
  return { from, to: input.choice };
}

export async function listCountryGatewayRules(): Promise<CountryRuleRow[]> {
  return rows(await raw({ find: COUNTRY_RULES, filter: {}, sort: { _id: 1 }, limit: 300 }))
    .filter((r) => isCountryCode(r._id) && isGateway(r.gateway) && isMatchBy(r.matchBy))
    .map((r) => ({ country: String(r._id), gateway: r.gateway as DonorGatewayOverride, matchBy: r.matchBy as MatchBy, reason: String(r.reason ?? ""), setBy: String(r.setBy ?? ""), setAt: String(r.setAt ?? "") }));
}

export async function listDonorGatewayOverrides(): Promise<OverrideRow[]> {
  return rows(await raw({ find: OVERRIDES, filter: {}, sort: { setAt: -1 }, limit: 500 }))
    .filter((d) => isGateway(d.gateway))
    .map((d) => ({ userId: String(d._id), gateway: d.gateway as DonorGatewayOverride, reason: String(d.reason ?? ""), setBy: String(d.setBy ?? ""), setAt: String(d.setAt ?? ""), phoneKey: typeof d.phoneKey === "string" ? d.phoneKey : null }));
}

export async function readDonorOverrideLog(limit = 50): Promise<OverrideLogRow[]> {
  return rows(await raw({ find: OVERRIDE_LOG, filter: {}, sort: { at: -1 }, limit: Math.min(200, Math.max(1, limit)), projection: { _id: 0 } }))
    .map((d) => ({ at: String(d.at), scope: d.scope === "COUNTRY" ? "COUNTRY" as const : "DONOR" as const, ...(d.userId ? { userId: String(d.userId) } : {}), ...(d.country ? { country: String(d.country) } : {}),
      from: d.from as OverrideChoice, to: d.to as OverrideChoice, ...(isMatchBy(d.matchBy) ? { matchBy: d.matchBy } : {}), reason: String(d.reason ?? ""), by: String(d.by ?? "") }));
}
