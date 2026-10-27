import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import * as phone from "../../lib/communication/phone";

function loadFrequencyModule(dependencies: Record<string, unknown>) {
  dependencies = { "node:crypto": crypto, "./phone": phone, ...dependencies };
  const file = "lib/communication/whatsapp-marketing-frequency.ts";
  const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded: { exports: Record<string, unknown> } = { exports: {} };
  new vm.Script(output, { filename: file }).runInNewContext({
    module: loaded,
    exports: loaded.exports,
    require: (id: string) => {
      if (!(id in dependencies)) throw new Error("Unexpected import: " + id);
      return dependencies[id];
    },
  });
  return loaded.exports as {
    reserveWhatsappMarketingSend: (userId: string | null, now?: Date, phone?: string | null) => Promise<
      | { ok: true; reservation: { userId: string | null; reservedAt: Date; previousAt: Date | null; reserved: boolean } }
      | { ok: false; reason: string }
    >;
    releaseWhatsappMarketingReservation: (reservation: { userId: string | null; reservedAt: Date; previousAt: Date | null; reserved: boolean }) => Promise<void>;
  };
}

function loadUnsubscribeHelpers() {
  const file = "lib/communication/whatsapp-template-unsubscribe.ts";
  const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded: { exports: Record<string, unknown> } = { exports: {} };
  new vm.Script(output, { filename: file }).runInNewContext({
    module: loaded,
    exports: loaded.exports,
  });
  return loaded.exports as {
    isWhatsappUnsubscribeQuickReply: (value: string) => boolean;
    whatsappUnsubscribeCopy: (locale: string) => { button: string; footer: string };
  };
}

function harness(options: {
  cooldownDays?: number;
  initialAt?: Date | null;
  historicalSendAt?: Date | null;
  failGlobalRead?: boolean;
  failProfileRead?: boolean;
} = {}) {
  let lastAt = options.initialAt ?? null;
  const calls = { reservations: 0, historyChecks: 0 };
  const dependencies: Record<string, unknown> = {
    "server-only": {},
    "@/lib/prisma": {
      prisma: {
        communicationGlobalControl: {
          findUnique: async () => {
            if (options.failGlobalRead) throw new Error("unavailable");
            return { emergencyStop: false, whatsappMarketingCooldownDays: options.cooldownDays ?? 7 };
          },
        },
        donorCommunicationProfile: {
          upsert: async () => ({ userId: "donor" }),
          findUnique: async () => {
            if (options.failProfileRead) throw new Error("unavailable");
            return { lastWhatsappMarketingAt: lastAt };
          },
          updateMany: async (args: { where: { lastWhatsappMarketingAt?: Date | { lte?: Date; isSet?: boolean } | null; OR?: unknown[] }; data: { lastWhatsappMarketingAt: Date | null } }) => {
            if (!args.where.OR && args.where.lastWhatsappMarketingAt && typeof args.where.lastWhatsappMarketingAt === "object") {
              const expectedAt = args.where.lastWhatsappMarketingAt as Date;
              if (!lastAt || lastAt.getTime() !== expectedAt.getTime()) return { count: 0 };
              lastAt = args.data.lastWhatsappMarketingAt;
              return { count: 1 };
            }
            const eligible = args.where.OR?.some((clause) => {
              const condition = clause as { lastWhatsappMarketingAt?: { lte?: Date; isSet?: boolean } | null };
              return (
                (condition.lastWhatsappMarketingAt === null && lastAt === null) ||
                (condition.lastWhatsappMarketingAt?.isSet === false && lastAt === null) ||
                (!!condition.lastWhatsappMarketingAt?.lte && (!lastAt || lastAt <= condition.lastWhatsappMarketingAt.lte))
              );
            });
            if (!eligible) return { count: 0 };
            calls.reservations++;
            lastAt = args.data.lastWhatsappMarketingAt;
            return { count: 1 };
          },
        },
        communicationDelivery: {
          findFirst: async (args: { where: { sentAt: { gt: Date } } }) => {
            calls.historyChecks++;
            const sentAt = options.historicalSendAt;
            return sentAt && sentAt > args.where.sentAt.gt ? { sentAt } : null;
          },
        },
      },
    },
    "./campaign-send-controls": {
      DEFAULT_WHATSAPP_MARKETING_COOLDOWN_DAYS: 0,
      MIN_WHATSAPP_MARKETING_COOLDOWN_DAYS: 0,
      MAX_WHATSAPP_MARKETING_COOLDOWN_DAYS: 365,
      readCampaignGlobalControls: async () => {
        if (options.failGlobalRead) return { ok: false };
        return { ok: true, controls: { emergencyStop: false, whatsappMarketingCooldownDays: options.cooldownDays ?? 0 } };
      },
    },
  };
  const frequencyModule = loadFrequencyModule(dependencies);
  return { module: frequencyModule, calls, current: () => lastAt };
}

test("a WhatsApp marketing reservation atomically admits only one concurrent send per donor", async () => {
  const now = new Date("2026-10-22T12:00:00.000Z");
  const h = harness({ cooldownDays: 7 });
  const results = await Promise.all([
    h.module.reserveWhatsappMarketingSend("donor", now),
    h.module.reserveWhatsappMarketingSend("donor", now),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => !result.ok && result.reason === "WHATSAPP_MARKETING_COOLDOWN").length, 1);
  assert.equal(h.calls.reservations, 1);
});

test("a recent legacy marketing delivery blocks a send before the new profile timestamp is populated", async () => {
  const now = new Date("2026-10-22T12:00:00.000Z");
  const h = harness({ cooldownDays: 7, historicalSendAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000) });
  const result = await h.module.reserveWhatsappMarketingSend("donor", now);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "WHATSAPP_MARKETING_COOLDOWN");
  assert.equal(h.current(), null);
});

test("the admin-configured cooldown duration controls eligibility", async () => {
  const now = new Date("2026-10-22T12:00:00.000Z");
  const h = harness({ cooldownDays: 3, initialAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000) });
  const result = await h.module.reserveWhatsappMarketingSend("donor", now);
  assert.equal(result.ok, true);
  if (result.ok) await h.module.releaseWhatsappMarketingReservation(result.reservation);
  assert.equal(h.current()?.getTime(), new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).getTime());
});

test("zero cooldown disables the frequency gate even when recent marketing sends exist", async () => {
  const now = new Date("2026-10-22T12:00:00.000Z");
  const recent = new Date(now.getTime() - 60 * 60 * 1000);
  const h = harness({ cooldownDays: 0, initialAt: recent, historicalSendAt: recent });
  const result = await h.module.reserveWhatsappMarketingSend("donor", now);
  assert.equal(result.ok, true);
  assert.equal(h.calls.reservations, 0);
  assert.equal(h.calls.historyChecks, 0);
  assert.equal(h.current()?.getTime(), recent.getTime());
  if (result.ok) await h.module.releaseWhatsappMarketingReservation(result.reservation);
  assert.equal(h.current()?.getTime(), recent.getTime());
});

test("zero cooldown also permits an unlinked recipient", async () => {
  const h = harness({ cooldownDays: 0 });
  const result = await h.module.reserveWhatsappMarketingSend(null);
  assert.equal(result.ok, true);
});

test("frequency configuration or profile read failures fail closed", async () => {
  const now = new Date("2026-10-22T12:00:00.000Z");
  const globalFailure = harness({ failGlobalRead: true });
  const profileFailure = harness({ failProfileRead: true, cooldownDays: 7 });
  const globalResult = await globalFailure.module.reserveWhatsappMarketingSend("donor", now);
  const profileResult = await profileFailure.module.reserveWhatsappMarketingSend("donor", now);
  assert.equal(globalResult.ok, false);
  if (!globalResult.ok) assert.equal(globalResult.reason, "WHATSAPP_FREQUENCY_CHECK_UNAVAILABLE");
  assert.equal(profileResult.ok, false);
  if (!profileResult.ok) assert.equal(profileResult.reason, "WHATSAPP_FREQUENCY_CHECK_UNAVAILABLE");
});

test("marketing templates carry a localized reply button that opts the recipient out", () => {
  const unsubscribe = loadUnsubscribeHelpers();
  assert.equal(unsubscribe.isWhatsappUnsubscribeQuickReply(unsubscribe.whatsappUnsubscribeCopy("ar").button), true);
  assert.equal(unsubscribe.isWhatsappUnsubscribeQuickReply(unsubscribe.whatsappUnsubscribeCopy("en").button), true);
  assert.equal(unsubscribe.isWhatsappUnsubscribeQuickReply(unsubscribe.whatsappUnsubscribeCopy("tr").button), true);
});

test('different donor accounts sharing a normalized phone can reserve only one marketing send', async () => {
  const profiles = new Map<string, Date | null>();
  const contacts = new Map<string, {lastSentAt:Date|null;reservationToken:string|null}>();
  const now = new Date('2026-10-27T10:00:00Z');
  const db = {
    donorCommunicationProfile: {
      upsert: async ({where}: {where:{userId:string}}) => { if (!profiles.has(where.userId)) profiles.set(where.userId,null); return {userId:where.userId}; },
      findUnique: async ({where}: {where:{userId:string}}) => ({lastWhatsappMarketingAt:profiles.get(where.userId)}),
      updateMany: async ({where,data}: {where:{userId:string;OR?:unknown[];lastWhatsappMarketingAt?:Date};data:{lastWhatsappMarketingAt:Date|null}}) => {
        const current=profiles.get(where.userId);
        if (where.OR ? current && current > new Date(now.getTime()-7*86400000) : current?.getTime()!==where.lastWhatsappMarketingAt?.getTime()) return {count:0};
        profiles.set(where.userId,data.lastWhatsappMarketingAt); return {count:1};
      },
    },
    communicationDelivery: { findFirst: async () => null },
    communicationContactFrequency: {
      upsert: async ({where}: {where:{id:string}}) => {if(!contacts.has(where.id))contacts.set(where.id,{lastSentAt:null,reservationToken:null});},
      findUnique: async ({where}: {where:{id:string}}) => contacts.get(where.id),
      updateMany: async ({where,data}: {where:{id:string;OR?:unknown[];reservationToken?:string};data:{lastSentAt:Date|null;reservationToken:string|null}}) => {
        const current=contacts.get(where.id)!;
        if (where.OR ? current.lastSentAt && current.lastSentAt > new Date(now.getTime()-7*86400000) : current.reservationToken!==where.reservationToken) return {count:0};
        contacts.set(where.id,data); return {count:1};
      },
    },
  };
  const frequency=loadFrequencyModule({'server-only':{},'@/lib/prisma':{prisma:db},'./campaign-send-controls':{MIN_WHATSAPP_MARKETING_COOLDOWN_DAYS:0,MAX_WHATSAPP_MARKETING_COOLDOWN_DAYS:365,readCampaignGlobalControls:async()=>({ok:true,controls:{whatsappMarketingCooldownDays:7}})}});
  const results=await Promise.all([frequency.reserveWhatsappMarketingSend('account-1',now,'+90 532 123 45 67'),frequency.reserveWhatsappMarketingSend('account-2',now,'00905321234567')]);
  assert.equal(results.filter(row=>row.ok).length,1);
  const winner=results.find(row=>row.ok)!; if(!winner.ok)throw new Error('no winner');
  assert.equal([...profiles.values()].filter(Boolean).length,1,'losing account reservation is released');
  await frequency.releaseWhatsappMarketingReservation(winner.reservation);
  const next=await frequency.reserveWhatsappMarketingSend('account-2',now,'+905321234567');assert.equal(next.ok,true,'a confirmed unsent attempt releases its own phone reservation');
  await frequency.releaseWhatsappMarketingReservation(winner.reservation);
  assert.equal((await frequency.reserveWhatsappMarketingSend('account-3',now,'+905321234567')).ok,false,'stale release cannot clear the newer phone reservation');
});
