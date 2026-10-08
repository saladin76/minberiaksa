import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { campaignCandidateWhere, candidatePagination } from "../../lib/communication/campaign-candidate-policy";
import { recipientExclusionReason, RECIPIENT_REASON_LABELS, type AudienceChannel } from "../../lib/communication/campaign-audience-accounting";

type RecordValue = Record<string, unknown>;
function matches(row: RecordValue, where: RecordValue): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND") return (condition as RecordValue[]).every((item) => matches(row, item));
    if (key === "OR") return (condition as RecordValue[]).some((item) => matches(row, item));
    const actual = row[key];
    if (condition !== null && typeof condition === "object") {
      const filter = condition as RecordValue;
      if ("isSet" in filter) return Object.hasOwn(row, key) === filter.isSet;
      if ("not" in filter) return Object.hasOwn(row, key) && actual !== null && actual !== filter.not;
      if ("in" in filter) return (filter.in as unknown[]).includes(actual);
      if ("notIn" in filter) return !(filter.notIn as unknown[]).includes(actual);
      throw new Error(`Unexpected filter ${key}`);
    }
    return Object.hasOwn(row, key) && actual === condition;
  });
}
const contacts = [undefined, null, "", " ", "+905551112233"];
const profiles = [null, {}, { doNotContact: true }, { whatsappOptIn: true, emailOptIn: true, smsOptIn: true },
  { doNotContact: false, whatsappOptIn: true, emailOptIn: true, smsOptIn: true },
  { doNotContact: false, whatsappOptIn: false, emailOptIn: false, smsOptIn: false },
  { doNotContact: true, whatsappOptIn: true, emailOptIn: true, smsOptIn: true }];
for (const channel of ["EMAIL", "WHATSAPP", "SMS"] as AudienceChannel[]) {
  test(`${channel}: candidate predicates reconcile contacts with resolved profile defaults`, () => {
    for (const contact of contacts) for (const profile of profiles) {
      const donor = { id: "user", ...(contact === undefined ? {} : { email: contact, phone: contact }), role: "DONOR" };
      const ids = recipientExclusionReason({ email: "present", phone: "present" }, channel, profile) === null ? ["user"] : [];
      const expected = recipientExclusionReason(donor, channel, profile) === null;
      assert.equal(matches(donor, campaignCandidateWhere({ role: "DONOR" }, channel, "eligible", ids) as RecordValue), expected);
      assert.equal(matches(donor, campaignCandidateWhere({ role: "DONOR" }, channel, "ineligible", ids) as RecordValue), !expected);
      assert.equal(matches(donor, campaignCandidateWhere({ role: "DONOR" }, channel, "all") as RecordValue), true);
    }
  });
}
test("all candidates adds no hidden gate; an unresolved explicit gate throws instead of widening", () => {
  const base = { role: "DONOR" as const, preferredLang: "ar" };
  assert.equal(campaignCandidateWhere(base, "WHATSAPP", "all"), base);
  assert.throws(() => campaignCandidateWhere(base, "WHATSAPP", "eligible"), /NOT_RESOLVED/);
});
test("pagination rejects malformed numeric inputs before reaching the database", () => {
  assert.deepEqual(candidatePagination(null, null), { page: 1, limit: 25 });
  assert.deepEqual(candidatePagination("2", "1000"), { page: 2, limit: 100 });
  for (const value of ["NaN", "Infinity", "1.5", "-1", "0", "1000001"]) assert.equal(candidatePagination(value, "25"), null);
  for (const value of ["NaN", "Infinity", "-1", "1.2", "0"]) assert.equal(candidatePagination("1", value), null);
});

function isolated<T>(file: string, dependencies: Record<string, unknown>): T {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new vm.Script(output, { filename: file }).runInNewContext({ module: loaded, exports: loaded.exports,
    require: (id: string) => { if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`); return dependencies[id]; },
  });
  return loaded.exports as T;
}
type Reply = { body: RecordValue; status: number; headers: Record<string, string> };
type RequestInput = { nextUrl: { searchParams: URLSearchParams }; json: () => Promise<unknown> };
function harness(opts: { denied?: boolean; failedRead?: boolean; failedConsent?: boolean; size?: number } = {}) {
  let reads = 0;
  let consentReads = 0;
  const queries: RecordValue[] = [];
  const profile = { doNotContact: false, whatsappOptIn: false, emailOptIn: true, smsOptIn: true };
  const route = isolated<{ GET: (input: RequestInput) => Promise<Reply>; POST: (input: RequestInput) => Promise<Reply> }>("app/api/communication/audience-candidates/route.ts", {
    "next/server": { NextResponse: { json: (body: RecordValue, init: { status: number; headers: Record<string, string> }) => ({ body, ...init }) } },
    "next-auth": { getServerSession: async () => ({}) }, "@prisma/client": {},
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => opts.denied ? { status: 403 } : null },
    "@/lib/prisma": { prisma: {
      user: {
        count: async (args: RecordValue) => { reads += 1; queries.push(args); if (opts.failedRead) throw new Error("read failed"); return 1; },
        findMany: async (args: RecordValue) => {
          reads += 1; queries.push(args);
          if (opts.failedRead) throw new Error("read failed");
          if ((args.select as RecordValue).communicationProfile) return [{ id: "user", name: "Donor", email: "donor@example.test", phone: "+905551112233", image: null, preferredLang: "ar", countryCode: "TR", communicationProfile: profile }];
          return Array.from({ length: Math.min(opts.size ?? 1, args.take as number) }, (_, i) => ({ id: String(i) }));
        }, groupBy: async () => [],
      }, badge: { findMany: async () => [], findUnique: async () => null },
    } },
    "@/lib/communication/audience-service": { donorChannelEligibility: (donor: { phone: string }, channel: AudienceChannel, preference: typeof profile) => recipientExclusionReason(donor, channel, preference) === null ? "ELIGIBLE" : "UNAVAILABLE" },
    "@/lib/communication/campaign-audience-accounting": { recipientExclusionReason, RECIPIENT_REASON_LABELS },
    "@/lib/communication/campaign-candidate-policy": { campaignCandidateWhere, candidatePagination },
    "@/lib/communication/campaign-consent-reader": { readCampaignConsentUserIds: async () => { consentReads++; if (opts.failedConsent) throw new Error("consent unavailable"); return ["user"]; } },
    "@/lib/communication/communication-runtime-types": { isCommunicationChannel: (value: string) => ["WHATSAPP", "EMAIL", "SMS"].includes(value) },
    "@/lib/badge-criteria": { getBadgeIdsByUser: async () => new Map(), getUserIdsMatchingBadge: async () => [] },
    "@/lib/dashboard/resolve-user-country": { resolveUserCountry: () => ({ code: "TR", name: "Turkey" }) },
    "@/lib/dashboard/country-display-name": { getCountryDisplayNameFromCode: () => "Turkey" },
    "@/lib/locales": { DEFAULT_LOCALE: "ar", isValidLocale: (value: string) => ["ar", "en"].includes(value) },
    "@/lib/dashboard/user-demographics": {
      birthdateRangeForAges: () => null, genderQueryValues: (value: string) => [value],
      parseGenderParam: (value: string) => ["male", "female", "undisclosed"].includes(value) ? value : null,
      parseAgeParam: (value: string) => { const num = Number(value); return Number.isInteger(num) && num >= 0 && num <= 120 ? num : null; },
    }, "@/lib/communication/audience-limits": { AUDIENCE_SELECTION_MAX: 5 },
  });
  return { route, state: () => ({ reads, queries, consentReads }) };
}
function request(query = "channel=WHATSAPP", body: unknown = { channel: "WHATSAPP" }): RequestInput {
  return { nextUrl: { searchParams: new URLSearchParams(query) }, json: async () => body };
}
test("candidate GET and POST authorize before any protected read", async () => {
  const h = harness({ denied: true });
  assert.equal((await h.route.GET(request())).status, 403);
  assert.equal((await h.route.POST(request())).status, 403);
  assert.equal(h.state().reads + h.state().consentReads, 0);
});
test("candidate GET labels unapproved contacts consistently and performs no consent writes", async () => {
  const h = harness();
  const res = await h.route.GET(request());
  assert.equal(res.status, 200);
  assert.equal(res.headers["Cache-Control"], "private, no-store");
  const donors = res.body.donors as RecordValue[];
  assert.equal(donors[0].eligibility, "UNAVAILABLE");
  assert.equal(donors[0].eligibilityReason, RECIPIENT_REASON_LABELS.WHATSAPP_OPT_IN_REQUIRED);
  assert.equal(h.state().consentReads, 0);
});
test("candidate read failures are 503, not fabricated zero counts", async () => {
  const h = harness({ failedRead: true });
  for (const response of [await h.route.GET(request()), await h.route.POST(request())]) {
    assert.equal(response.status, 503); assert.equal(response.body.ok, false);
    assert.equal("donors" in response.body, false); assert.equal("ids" in response.body, false);
  }
});
test("failed consent resolution cannot silently widen select-all or return a partial population", async () => {
  const h = harness({ failedConsent: true });
  assert.equal((await h.route.GET(request("channel=WHATSAPP&eligibility=eligible"))).status, 503);
  assert.equal((await h.route.POST(request("", { channel: "WHATSAPP", eligibility: "ineligible" }))).status, 503);
  assert.equal(h.state().reads, 0);
});
test("bad filters and malformed pagination fail without querying donors", async () => {
  const h = harness();
  for (const query of ["channel=WHATSAPP&page=foo", "channel=WHATSAPP&badgeId=bad", "channel=WHATSAPP&eligibility=invalid", "channel=WHATSAPP&locale=unknown", "channel=WHATSAPP&minAge=80&maxAge=20"]) assert.equal((await h.route.GET(request(query))).status, 400);
  for (const body of [null, [], "bad", { channel: "WHATSAPP", search: {} }, { channel: "INVALID" }]) assert.equal((await h.route.POST(request("", body))).status, 400);
  assert.equal(h.state().reads, 0);
});
test("select-all truncation is true only when more than the ceiling exists", async () => {
  assert.equal((await harness({ size: 5 }).route.POST(request())).body.truncated, false);
  const large = await harness({ size: 6 }).route.POST(request());
  assert.equal(large.body.truncated, true); assert.equal((large.body.ids as string[]).length, 5);
});
test("explicit eligibility precedes GET count/pagination and matches POST select-all", async () => {
  const h = harness();
  await h.route.GET(request("channel=WHATSAPP&eligibility=eligible"));
  await h.route.POST(request("", { channel: "WHATSAPP", eligibility: "eligible" }));
  const queries = h.state().queries;
  assert.equal(JSON.stringify(queries[0].where), JSON.stringify(queries[1].where));
  assert.equal(JSON.stringify(queries[0].where), JSON.stringify(queries[2].where));
  assert.equal(JSON.stringify(queries[1].orderBy), JSON.stringify(queries[2].orderBy));
});

type Reader = { readCampaignConsentUserIds: (channel: AudienceChannel, signal?: AbortSignal) => Promise<string[]> };
function consentReader(failPage = 0, repeat = false): Reader {
  let calls = 0;
  const rows = Array.from({ length: 2001 }, (_, i) => ({ id: String(i + 1).padStart(6, "0"), userId: `user-${i}`, doNotContact: i % 5 === 0, whatsappOptIn: i % 2 === 0, emailOptIn: false, smsOptIn: true }));
  return isolated<Reader>("lib/communication/campaign-consent-reader.ts", {
    "@/lib/prisma": { prisma: { donorCommunicationProfile: {
      findFirst: async () => ({ id: "002001" }),
      findMany: async (args: { where: { id: { gt?: string; lte: string } }; take: number }) => {
        calls++; if (calls === failPage) throw new Error("source page failed");
        assert.equal(args.take, 1000);
        return rows.filter((row) => repeat || !args.where.id.gt || row.id > args.where.id.gt).slice(0, args.take);
      },
    } } }, "./campaign-audience-accounting": { recipientExclusionReason },
  });
}
test("consent reader walks bounded pages, applies DNC and never truncates at the first page", async () => {
  const ids = await consentReader().readCampaignConsentUserIds("WHATSAPP");
  assert.equal(ids.length, 800); assert.equal(new Set(ids).size, ids.length);
});
test("consent reader rejects failed pages and repeated cursors rather than returning partial IDs", async () => {
  await assert.rejects(consentReader(2).readCampaignConsentUserIds("WHATSAPP"), /source page failed/);
  await assert.rejects(consentReader(0, true).readCampaignConsentUserIds("WHATSAPP"), /CURSOR_NOT_ADVANCING/);
});
test("cancelled consent reads do not return an empty successful filter", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(consentReader().readCampaignConsentUserIds("WHATSAPP", controller.signal));
});
