import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

function isolated<T>(file: string, dependencies: Record<string, unknown>): T {
  const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new vm.Script(output, { filename: file }).runInNewContext({
    module: loaded, exports: loaded.exports, process: { env: { DATABASE_URL: "mongodb://127.0.0.1:27017/isolated_test" } },
    require: (id: string) => {
      if (!(id in dependencies)) throw new Error(`Unexpected import: ${id}`);
      return dependencies[id];
    },
  });
  return loaded.exports as T;
}

const locales = {
  DEFAULT_LOCALE: "ar", SUPPORTED_LOCALES: ["ar", "en"],
  LOCALES: { ar: { label: "Arabic" }, en: { label: "English" } },
  isValidLocale: (value: string) => ["ar", "en"].includes(value),
};
const policy = isolated<Record<string, unknown>>("lib/communication/campaign-audience-accounting.ts", {});
const validation = isolated<Record<string, unknown>>("lib/communication/campaign-contact-validation.ts", {});
const approved = { doNotContact: false, whatsappOptIn: true, emailOptIn: true, smsOptIn: true };
type Donor = { email: string | null; phone: string | null; communicationProfile: typeof approved | null };
type RetryRow = { channel: string; purpose: string; campaignId: string | null; recipientUserId: string | null; recipientEmail: string | null; recipientPhone: string | null };
type Guard = {
  checkRetryRecipient: (row: RetryRow, planned?: string) => Promise<{ ok: boolean; contact?: string; code?: string }>;
  retryDefinitelyNotSent: (reason: string) => boolean;
};
const row: RetryRow = { channel: "WHATSAPP", purpose: "MARKETING", campaignId: "campaign", recipientUserId: "user", recipientEmail: "donor@example.test", recipientPhone: "+905551112233" };
function retryHarness(donor: Donor | null, failure = false): Guard {
  return isolated<Guard>("lib/communication/retry-recipient-guard.ts", {
    "@/lib/prisma": { prisma: { user: { findUnique: async () => {
      if (failure) throw new Error("database unavailable");
      return donor;
    } } } },
    "./campaign-audience-accounting": policy,
    "./campaign-contact-validation": validation,
  });
}
const donor: Donor = { email: "donor@example.test", phone: "+905551112233", communicationProfile: approved };

test("retry guard accepts unchanged recipient and canonical international formatting", async () => {
  const result = await retryHarness(donor).checkRetryRecipient({ ...row, recipientPhone: "+90 (555) 111-22-33" });
  assert.equal(result.ok, true);
  assert.equal(result.contact, donor.phone);
});
test("campaign retry cannot bypass the existing WhatsApp consent gate", async () => {
  const result = await retryHarness({ ...donor, communicationProfile: { ...approved, whatsappOptIn: false } }).checkRetryRecipient(row);
  assert.equal(result.code, "CONSENT_BLOCKED");
});
test("campaign retry does not interpret an absent profile as permission", async () => {
  assert.equal((await retryHarness({ ...donor, communicationProfile: null }).checkRetryRecipient(row)).code, "CONSENT_BLOCKED");
});
test("manual WhatsApp retains its separate existing policy", async () => {
  assert.equal((await retryHarness({ ...donor, communicationProfile: null }).checkRetryRecipient({ ...row, campaignId: null })).ok, true);
});
test("transactional email remains independent of marketing opt-in", async () => {
  assert.equal((await retryHarness({ ...donor, communicationProfile: null }).checkRetryRecipient({ ...row, channel: "EMAIL", purpose: "TRANSACTIONAL", campaignId: null })).ok, true);
});
test("email and SMS marketing retain their channel preference gates", async () => {
  for (const channel of ["EMAIL", "SMS"]) {
    assert.equal((await retryHarness({ ...donor, communicationProfile: null }).checkRetryRecipient({ ...row, channel, campaignId: null })).code, "CONSENT_BLOCKED");
  }
});
test("DNC blocks both campaign and manual retries", async () => {
  for (const campaignId of ["campaign", null]) {
    assert.equal((await retryHarness({ ...donor, communicationProfile: { ...approved, doNotContact: true } }).checkRetryRecipient({ ...row, campaignId })).code, "CONSENT_BLOCKED");
  }
});
test("deleted donor never falls back to the stored destination", async () => {
  assert.equal((await retryHarness(null).checkRetryRecipient(row)).code, "RECIPIENT_NOT_FOUND");
});
test("changed destination cannot receive a historical personal message", async () => {
  assert.equal((await retryHarness({ ...donor, phone: "+905551112244" }).checkRetryRecipient(row)).code, "RECIPIENT_CONTACT_CHANGED");
});
test("missing snapshot may use a newly supplied contact, then pins the attempt", async () => {
  const input = { ...row, recipientPhone: null };
  assert.equal((await retryHarness(donor).checkRetryRecipient(input)).ok, true);
  assert.equal((await retryHarness({ ...donor, phone: "+905551112244" }).checkRetryRecipient(input, donor.phone!)).code, "RECIPIENT_CONTACT_CHANGED");
});
test("invalid and missing current contacts block before provider calls", async () => {
  assert.equal((await retryHarness({ ...donor, phone: "not a phone" }).checkRetryRecipient(row)).code, "INVALID_CONTACT");
  assert.equal((await retryHarness({ ...donor, phone: null }).checkRetryRecipient(row)).code, "NO_RECIPIENT");
});
test("read failure is unavailable verification, not an opt-out or a send", async () => {
  assert.equal((await retryHarness(donor, true).checkRetryRecipient(row)).code, "RECIPIENT_CHECK_UNAVAILABLE");
});
test("campaign row without a donor reference cannot escape the guard", async () => {
  assert.equal((await retryHarness(donor).checkRetryRecipient({ ...row, recipientUserId: null })).code, "RECIPIENT_CHECK_UNAVAILABLE");
});
test("ambiguous provider outcomes never authorize an automatic duplicate retry", () => {
  const guard = retryHarness(donor);
  assert.equal(guard.retryDefinitelyNotSent("EMAIL_NOT_CONFIGURED"), true);
  assert.equal(guard.retryDefinitelyNotSent("EMAIL_SUPPRESSED"), true);
  for (const reason of ["NETWORK_ERROR", "HTTP_500", "TIMEOUT", "UNKNOWN", "SEND_THREW"]) assert.equal(guard.retryDefinitelyNotSent(reason), false);
});

type Member = { memberId: string; userId: string; locale: string; missingDonor: boolean; email: string | null; phone: string | null };
type Page = { members: Member[]; exhausted: boolean; nextCursor: string | null };
type Reader = { readCampaignListPage: (id: string, opts: { limit: number; cursorId?: string | null }) => Promise<Page> };
type ReaderOptions = { type?: string; status?: string; missingList?: boolean; failAt?: "list" | "members" | "donors" | "profiles"; deleted?: number; malformed?: boolean };
function audienceHarness(size: number, options: ReaderOptions = {}) {
  const data = Array.from({ length: size }, (_, index) => ({ id: String(index + 1).padStart(8, "0"), userId: `user-${index + 1}`, locale: index % 2 ? "en" : "ar" }));
  const users = data.filter((_, index) => index !== options.deleted).map((member) => ({ id: member.userId, name: "Donor", email: "donor@example.test", phone: "+905551112233", preferredLang: member.locale, countryCode: "TR" }));
  let writeCalls = 0;
  const prisma = {
    communicationAudienceList: { findUnique: async () => {
      if (options.failAt === "list") throw new Error("list read failed");
      return options.missingList ? null : { id: "list", type: options.type ?? "CUSTOM", status: options.status ?? "ACTIVE" };
    } },
    communicationAudienceMember: {
      count: async () => size,
      findMany: async (args: { where: { contactType: string; id?: { gt: string } }; take: number }) => {
        assert.equal(args.where.contactType, "DONOR");
        assert.ok(args.take <= 1000);
        if (options.failAt === "members") throw new Error("member read failed");
        const result = data.filter((member) => !args.where.id || member.id > args.where.id.gt).slice(0, args.take);
        return options.malformed ? result.map((member) => ({ ...member, userId: null })) : result;
      },
    },
    user: { findMany: async (args: { where: { id: { in: string[] }; role: string } }) => {
      assert.equal(args.where.role, "DONOR");
      if (options.failAt === "donors") throw new Error("donor read failed");
      return users.filter((user) => args.where.id.in.includes(user.id));
    } },
    donorCommunicationProfile: { findMany: async (args: { where: { userId: { in: string[] } } }) => {
      if (options.failAt === "profiles") throw new Error("profile read failed");
      return args.where.userId.in.map((userId) => ({ userId, ...approved }));
    } },
  };
  const reader = isolated<Reader>("lib/communication/campaign-list-reader.ts", { "@/lib/prisma": { prisma }, "@/lib/locales": locales });
  const service = isolated<{
    countCampaignAudience: (key: string) => Promise<number>;
    loadCampaignRecipients: (channel: string, key: string, opts?: { limit: number; cursor?: string | null }) => Promise<{ recipients: Member[]; skipped: Array<{ reason: string }>; nextCursor: string | null; exhausted: boolean }>;
    getRecipientBreakdown: (channel: string, opts: { locale: string }) => Promise<{ totals: { total: number; eligible: number; needsReview: number }; locales: Array<{ total: number }> }>;
  }>("lib/communication/campaign-recipient-service.ts", {
    "@/lib/prisma": { prisma }, "@/lib/locales": locales,
    "./audience-list-service": { parseListKey: (key: string) => key.startsWith("list:") ? key.slice(5) : null },
    "./smart-audience": { getSmartAudienceDefinitionForList: async () => null },
    "./donor-communication-profile-service": { ensureProfilesForUsers: async () => { writeCalls += 1; } },
    "./campaign-audience-accounting": policy,
    "./campaign-list-reader": reader,
  });
  return { reader, service, writes: () => writeCalls };
}

test("saved audience preview covers all 2,501 members, not a screen or sample cap", async () => {
  const harness = audienceHarness(2501);
  const preview = await harness.service.getRecipientBreakdown("WHATSAPP", { locale: "list:list" });
  assert.equal(preview.totals.total, 2501);
  assert.equal(preview.totals.eligible, 2501);
  assert.equal(preview.locales.reduce((sum, locale) => sum + locale.total, 0), 2501);
  assert.equal(harness.writes(), 0);
});
test("saved audience execution advances through an exact-size last page", async () => {
  const harness = audienceHarness(1000);
  const first = await harness.service.loadCampaignRecipients("WHATSAPP", "list:list", { limit: 1000 });
  assert.equal(first.recipients.length, 1000);
  assert.equal(first.exhausted, false);
  const final = await harness.service.loadCampaignRecipients("WHATSAPP", "list:list", { limit: 1000, cursor: first.nextCursor });
  assert.equal(final.exhausted, true);
  assert.equal(final.recipients.length, 0);
  assert.equal(final.nextCursor, first.nextCursor);
});
for (const failAt of ["list", "members", "donors", "profiles"] as const) {
  test(`saved audience ${failAt} failure rejects instead of declaring completion`, async () => {
    const harness = audienceHarness(2, { failAt });
    await assert.rejects(harness.service.loadCampaignRecipients("WHATSAPP", "list:list"), /read failed/);
  });
}
test("deleted donor is an explicit skip and remains in the audience totals", async () => {
  const harness = audienceHarness(3, { deleted: 1 });
  const page = await harness.service.loadCampaignRecipients("WHATSAPP", "list:list");
  assert.equal(page.recipients.length, 2);
  assert.equal(page.skipped.length, 1);
  assert.equal(page.skipped[0].reason, "RECIPIENT_NOT_FOUND");
  const preview = await harness.service.getRecipientBreakdown("WHATSAPP", { locale: "list:list" });
  assert.equal(preview.totals.total, 3);
  assert.equal(preview.totals.needsReview, 1);
});
for (const [options, error] of [
  [{ type: "TEST" }, "TEST_AUDIENCE_NOT_ALLOWED_FOR_CAMPAIGN"],
  [{ status: "ARCHIVED" }, "AUDIENCE_LIST_NOT_ACTIVE"],
  [{ missingList: true }, "AUDIENCE_LIST_NOT_FOUND"],
  [{ type: "SMART" }, "SMART_AUDIENCE_DEFINITION_UNAVAILABLE"],
] as Array<[ReaderOptions, string]>) {
  test(`saved audience rejects ${error} without creating a replacement audience`, async () => {
    await assert.rejects(audienceHarness(2, options).service.countCampaignAudience("list:list"), new RegExp(error));
  });
}
test("corrupt donor references reject explicitly rather than silently disappearing", async () => {
  await assert.rejects(audienceHarness(1, { malformed: true }).reader.readCampaignListPage("list", { limit: 20 }), /AUDIENCE_MEMBER_MISSING_DONOR_REFERENCE/);
});
test("saved list reader bounds untrusted page sizes", async () => {
  const harness = audienceHarness(1200);
  assert.equal((await harness.reader.readCampaignListPage("list", { limit: Infinity })).members.length, 500);
  assert.equal((await harness.reader.readCampaignListPage("list", { limit: 9000 })).members.length, 1000);
});

type RetryEngineResult = { code: string; ok: boolean };
type EngineOptions = { outcome?: "accept" | "throw" | "unknown" | "unconfigured"; failLink?: boolean; failArchive?: boolean; revokeBeforeSend?: boolean; child?: boolean; status?: string };
function engineHarness(options: EngineOptions = {}) {
  let held = false;
  let sends = 0;
  let released = 0;
  let guardCalls = 0;
  let payload: Record<string, unknown> | null = null;
  let lastQuery: Record<string, unknown> | null = null;
  const events: string[] = [];
  const stored = { id: "original", channel: "EMAIL", status: options.status ?? "FAILED", origin: "CAMPAIGN", purpose: "MARKETING", locale: "en", templateId: "template", templateName: "template", recipientUserId: "user", recipientEmail: "donor@example.test", recipientPhone: null, recipientName: "Donor", renderedSubject: "Subject", renderedBody: "Body", variables: {}, campaignId: "campaign", retriedAt: null, retryOfDeliveryId: options.child ? "parent" : null };
  const engine = isolated<{
    retryDelivery: (id: string, opts?: { config: Record<string, unknown> }) => Promise<RetryEngineResult>;
    listRetryCandidates: (filter: { channel: string; ids?: string[] }) => Promise<string[]>;
    retryPreflight: (filter: { channel: string; ids?: string[] }) => Promise<unknown>;
  }>("lib/communication/delivery-retry-service.ts", {
    "@/lib/prisma": { prisma: {
      communicationDelivery: {
        findUnique: async () => ({ ...stored, retriedAt: held ? new Date() : null }),
        updateMany: async (args: { where: { status?: string }; data: { retriedAt: Date | null } }) => {
          if (args.data.retriedAt === null) { released += 1; held = false; return { count: 1 }; }
          assert.equal(args.where.status, "FAILED");
          if (held) return { count: 0 };
          held = true;
          events.push("claim");
          return { count: 1 };
        },
        update: async () => { if (options.failLink) throw new Error("link failed"); events.push("link"); return {}; },
        findMany: async (args: Record<string, unknown>) => { lastQuery = args; return []; },
        count: async () => 0,
      },
      donorCommunicationProfile: { findUnique: async () => approved },
    } },
    "./delivery-log-service": {
      createDeliveryRecord: async () => { events.push("create"); return { ok: true, data: { id: "attempt" } }; },
      markDeliveryStatus: async (_id: string, status: string) => {
        events.push(status);
        return { ok: !(options.failArchive && status === "SENT"), error: "archive failed" };
      },
    },
    "./provider-router": { sendPreparedDelivery: async (value: Record<string, unknown>) => {
      sends += 1; payload = value; events.push("send");
      if (options.outcome === "throw") throw new Error("simulated socket failure");
      if (options.outcome === "unknown") return { ok: false, reason: "HTTP_500" };
      if (options.outcome === "unconfigured") return { ok: false, reason: "EMAIL_NOT_CONFIGURED" };
      return { ok: true, providerMessageId: "provider-id", internalAccepted: false };
    } },
    "@/lib/events/dispatch": { resolveTriggerSendConfig: async () => ({}), resolveTriggerSender: () => ({ ok: true, sender: { id: "sender", senderEmail: "sender@example.test" } }) },
    "./automatic-message-dispatcher": {},
    "./providers/meta-whatsapp/parameters": {},
    "./providers/sms/client": {},
    "./retry-recipient-guard": {
      checkRetryRecipient: async () => {
        guardCalls += 1; events.push("guard");
        return options.revokeBeforeSend && guardCalls > 1 ? { ok: false, code: "CONSENT_BLOCKED" } : { ok: true, contact: "donor@example.test" };
      },
      retryDefinitelyNotSent: retryHarness(donor).retryDefinitelyNotSent,
    },
    "./communication-runtime-types": { RETRYABLE_STATUSES: ["FAILED", "SKIPPED"], NON_RETRYABLE_TERMINAL: ["BOUNCED"], isCommunicationChannel: (channel: string) => ["EMAIL", "SMS", "WHATSAPP"].includes(channel) },
  });
  return { engine, state: () => ({ held, sends, released, payload, lastQuery, events }) };
}

test("retry executor preserves marketing purpose and locale through the actual provider call", async () => {
  const harness = engineHarness();
  assert.equal((await harness.engine.retryDelivery("original")).code, "SENT");
  const state = harness.state();
  assert.equal(state.payload?.purpose, "MARKETING");
  assert.equal(state.payload?.locale, "en");
  assert.ok(state.events.indexOf("link") < state.events.indexOf("send"));
  assert.ok(state.events.lastIndexOf("guard") < state.events.indexOf("send"));
});
test("retry executor rechecks withdrawal immediately before sending", async () => {
  const harness = engineHarness({ revokeBeforeSend: true });
  assert.equal((await harness.engine.retryDelivery("original")).code, "CONSENT_BLOCKED");
  assert.equal(harness.state().sends, 0);
  assert.equal(harness.state().released, 1);
});
test("retry executor prevents two concurrent calls from sending twice", async () => {
  const harness = engineHarness();
  const results = await Promise.all([harness.engine.retryDelivery("original"), harness.engine.retryDelivery("original")]);
  assert.equal(harness.state().sends, 1);
  assert.ok(results.some((result) => result.code === "ALREADY_RETRIED"));
});
test("retry lineage must be archived before contacting the provider", async () => {
  const harness = engineHarness({ failLink: true });
  assert.equal((await harness.engine.retryDelivery("original")).code, "ARCHIVE_FAILED");
  assert.equal(harness.state().sends, 0);
});
test("retrying a child cannot race a separate retry of its original", async () => {
  const harness = engineHarness({ child: true });
  assert.equal((await harness.engine.retryDelivery("attempt")).code, "RETRY_ORIGINAL_REQUIRED");
  assert.equal(harness.state().sends, 0);
});
for (const outcome of ["throw", "unknown"] as const) {
  test(`retry executor holds its claim on an ambiguous ${outcome} outcome`, async () => {
    const harness = engineHarness({ outcome });
    assert.equal((await harness.engine.retryDelivery("original")).code, "DELIVERY_OUTCOME_UNCERTAIN");
    assert.equal(harness.state().held, true);
    assert.equal((await harness.engine.retryDelivery("original")).code, "ALREADY_RETRIED");
    assert.equal(harness.state().sends, 1);
  });
}
test("retry executor can release a proven pre-send configuration rejection", async () => {
  const harness = engineHarness({ outcome: "unconfigured" });
  assert.equal((await harness.engine.retryDelivery("original")).code, "PROVIDER_REJECTED");
  assert.equal(harness.state().released, 1);
});
test("provider acceptance plus archive failure never claims a completed recorded send", async () => {
  const harness = engineHarness({ failArchive: true });
  const result = await harness.engine.retryDelivery("original");
  assert.equal(result.code, "ACCEPTED_UNRECORDED");
  assert.equal(result.ok, false);
  assert.equal(harness.state().held, true);
});
test("retry candidates and preflight respect the explicit empty selection and channel", async () => {
  const harness = engineHarness();
  await harness.engine.listRetryCandidates({ channel: "EMAIL", ids: [] });
  let where = harness.state().lastQuery?.where as { id: { in: string[] }; channel: string; AND: unknown[] };
  assert.equal(where.id.in.length, 0);
  assert.equal(where.channel, "EMAIL");
  assert.equal(where.AND.length, 1);
  await harness.engine.retryPreflight({ channel: "SMS", ids: [] });
  where = harness.state().lastQuery?.where as typeof where;
  assert.equal(where.id.in.length, 0);
  assert.equal(where.channel, "SMS");
});
