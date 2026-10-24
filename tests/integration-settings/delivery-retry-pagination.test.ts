import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

type Cursor = { id: string; createdAt: Date };
type Service = {
  listRetryCandidatePage: (filter: { channel: "WHATSAPP" }, after?: Cursor | null, take?: number) => Promise<Cursor[]>;
};

function loadService(includeMissingPayload = false) {
  const calls: Array<Record<string, unknown>> = [];
  const firstPage = Array.from({ length: 25 }, (_, index) => ({ id: `delivery-${index + 1}`, createdAt: new Date("2026-10-01T00:00:00.000Z"), channel: "WHATSAPP", templateId: "tpl", renderedBody: null, variables: includeMissingPayload ? null : { snapshot: {} } }));
  const secondPage = [{ id: "delivery-26", createdAt: new Date("2026-10-01T00:00:00.000Z"), channel: "WHATSAPP", templateId: "tpl", renderedBody: null, variables: { snapshot: {} } }];
  const prisma = {
    communicationDelivery: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push(args);
        return calls.length === 1 ? firstPage : secondPage;
      },
    },
  };
  const dependencies: Record<string, unknown> = {
    "./template-donation-links": { donationTemplateValues: async () => ({ ok: true, values: {} }) },
    "@/lib/templates/localize-donation-failure-link": { localizeDonationFailureLinks: (body: string) => body },
    "./retry-batches": { RETRY_BATCH_CAP: 25 },
    "./retry-readiness": { retryPayloadBlockReason: (row: { variables?: unknown }) => row.variables ? null : "NO_RENDERED_BODY" },
    "@/lib/prisma": { prisma },
    "./delivery-log-service": { createDeliveryRecord: async () => ({ ok: true }), markDeliveryStatus: async () => ({ ok: true }) },
    "./provider-router": { sendPreparedDelivery: async () => ({ ok: true }) },
    "@/lib/events/dispatch": { resolveTriggerSendConfig: async () => ({}), resolveTriggerSender: () => ({ ok: false }), },
    "./automatic-message-dispatcher": { resolveMetaTemplateMapping: () => null },
    "./providers/meta-whatsapp/parameters": { buildMetaComponents: () => ({ ok: true, components: [] }) },
    "./providers/sms/client": { resolveSmsProvider: async () => ({ provider: "SMS" }) },
    "./retry-recipient-guard": { checkRetryRecipient: async () => ({ ok: true }), retryDefinitelyNotSent: () => true },
    "./whatsapp-marketing-frequency": { reserveWhatsappMarketingSend: async () => ({ ok: true }), releaseWhatsappMarketingReservation: async () => {} },
    "./communication-runtime-types": { RETRYABLE_STATUSES: ["FAILED"], NON_RETRYABLE_TERMINAL: ["BOUNCED"], isCommunicationChannel: () => true },
  };
  const source = fs.readFileSync("lib/communication/delivery-retry-service.ts", "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as Record<string, unknown> };
  new vm.Script(output).runInNewContext({
    module: loaded,
    exports: loaded.exports,
    process: { env: { DATABASE_URL: "test" } },
    require: (id: string) => {
      if (!(id in dependencies)) throw new Error(`Unexpected import: ${id}`);
      return dependencies[id];
    },
  });
  return { service: loaded.exports as Service, calls };
}

test("retry candidate pages advance by (createdAt, id) while retaining the 25-row request bound", async () => {
  const { service, calls } = loadService();
  const first = await service.listRetryCandidatePage({ channel: "WHATSAPP" }, null, 10_000);
  assert.equal(first.length, 25);
  assert.equal(calls[0].take, 25);

  const cursor = first.at(-1)!;
  const second = await service.listRetryCandidatePage({ channel: "WHATSAPP" }, cursor, 10_000);
  assert.deepEqual(Array.from(second, (row) => row.id), ["delivery-26"]);
  assert.equal(calls[1].take, 25);

  const where = calls[1].where as { AND: Array<{ OR?: Array<Record<string, unknown>> }> };
  const after = where.AND.find((clause) => clause.OR?.some((branch) => "createdAt" in branch && typeof branch.createdAt === "object"));
  assert.ok(after, "the second page must include a keyset cursor condition");
  assert.equal(after.OR?.length, 2);
  const strictlyLater = after.OR?.[0]?.createdAt as { gt?: Date } | undefined;
  const sameDateLaterId = after.OR?.[1];
  assert.equal(strictlyLater?.gt?.toISOString(), cursor.createdAt.toISOString());
  assert.equal((sameDateLaterId?.createdAt as Date | undefined)?.toISOString(), cursor.createdAt.toISOString());
  assert.equal((sameDateLaterId?.id as { gt?: string } | undefined)?.gt, cursor.id);
});

test("retry pagination advances past a full page without archived content and retains later ready recipients", async () => {
  const { service, calls } = loadService(true);
  const ready = await service.listRetryCandidatePage({ channel: "WHATSAPP" });
  assert.deepEqual(Array.from(ready, (row) => row.id), ["delivery-26"]);
  assert.equal(calls.length, 2);
  assert.ok(JSON.stringify(calls[1].where).includes('"gt":"delivery-25"'));
});

type RetryRoute = {
  GET: (request: { nextUrl: { searchParams: URLSearchParams } }) => Promise<Response>;
  POST: (request: { json: () => Promise<unknown> }) => Promise<Response>;
};

function loadRetryRoute() {
  const candidateQueries: Array<{ filter: Record<string, unknown>; after: unknown }> = [];
  const createdAt = new Date("2026-10-01T00:00:00.000Z");
  const firstPage = Array.from({ length: 25 }, (_, index) => ({ id: `delivery-${index + 1}`, createdAt }));
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: Record<string, unknown>, init?: { status?: number }) => new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { "content-type": "application/json" } }) } },
    "next-auth": { getServerSession: async () => ({ user: { id: "admin" } }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => null },
    "@/lib/audit-log": { writeAuditLog: async () => {}, auditActorFromDashboardSession: () => ({ actorId: "admin" }) },
    "@/lib/events/dispatch": { resolveTriggerSendConfig: async () => ({}) },
    "@/lib/communication/delivery-retry-service": {
      retryDelivery: async (deliveryId: string) => ({ deliveryId, code: "SENT", ok: true, message: "sent" }),
      retryPreflight: async () => ({ eligible: 25, alreadyRetried: 0, bounced: 0, cap: 25, oldestDays: 1, byReason: [] }),
      listRetryCandidatePage: async (filter: Record<string, unknown>, after: unknown) => {
        candidateQueries.push({ filter, after });
        return after ? [] : firstPage;
      },
      RETRY_BATCH_CAP: 25,
    },
    "@/lib/communication/communication-runtime-types": { isCommunicationChannel: (channel: string) => channel === "WHATSAPP" },
    "@/lib/communication/purpose-group": { parseCommunicationPurposeGroup: (value: unknown) => value === "MARKETING" || value === "AUTOMATIC" ? value : undefined },
  };
  const source = fs.readFileSync("app/api/dashboard/communication/deliveries/retry/route.ts", "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as Record<string, unknown> };
  new vm.Script(output).runInNewContext({
    module: loaded,
    exports: loaded.exports,
    TextEncoder,
    ReadableStream,
    Response,
    console: { error: () => {} },
    require: (id: string) => {
      if (!(id in dependencies)) throw new Error(`Unexpected import: ${id}`);
      return dependencies[id];
    },
  });
  return { route: loaded.exports as RetryRoute, candidateQueries };
}

function ndjson(response: Response): Promise<Array<Record<string, unknown>>> {
  return response.text().then((body) => body.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>));
}

test("bulk retry carries one frozen preflight range through every bounded page", async () => {
  const { route, candidateQueries } = loadRetryRoute();
  const preflightResponse = await route.GET({ nextUrl: { searchParams: new URLSearchParams("channel=WHATSAPP&days=30") } });
  const preflight = await preflightResponse.json() as { range: { from: string | null; to: string } };
  assert.equal(preflightResponse.status, 200);
  assert.ok(preflight.range.from);
  assert.equal(Date.parse(preflight.range.to) - Date.parse(preflight.range.from!), 30 * 86_400_000);

  const firstResponse = await route.POST({ json: async () => ({ channel: "WHATSAPP", days: 30, range: preflight.range }) });
  const firstEvents = await ndjson(firstResponse);
  const firstDone = firstEvents.at(-1)!;
  assert.equal(firstDone.type, "done");
  assert.equal(firstDone.hasMore, true);
  const nextCursor = firstDone.nextCursor as { id: string; createdAt: string };
  assert.equal(nextCursor.id, "delivery-25");
  assert.equal(nextCursor.createdAt, "2026-10-01T00:00:00.000Z");

  const secondResponse = await route.POST({ json: async () => ({ channel: "WHATSAPP", days: 30, range: preflight.range, after: firstDone.nextCursor }) });
  const secondEvents = await ndjson(secondResponse);
  const secondDone = secondEvents.at(-1)!;
  assert.equal(secondDone.hasMore, false);
  assert.equal(secondDone.nextCursor, null);
  assert.equal(candidateQueries.length, 2);
  for (const query of candidateQueries) {
    assert.equal((query.filter.from as Date).toISOString(), preflight.range.from);
    assert.equal((query.filter.to as Date).toISOString(), preflight.range.to);
  }
});

test("campaign retries keep their campaign and purpose scope without the dashboard's day cutoff", async () => {
  const { route, candidateQueries } = loadRetryRoute();
  const response = await route.GET({ nextUrl: { searchParams: new URLSearchParams("channel=WHATSAPP&days=30&campaign=campaign-1&purposeGroup=MARKETING") } });
  const preflight = await response.json() as { range: { from: string | null; to: string } };
  assert.equal(response.status, 200);
  assert.equal(preflight.range.from, null);
  const sent = await route.POST({ json: async () => ({ channel: "WHATSAPP", campaignId: "campaign-1", purposeGroup: "MARKETING", days: 30, range: preflight.range }) });
  const events = await ndjson(sent);
  assert.equal(events.at(-1)?.type, "done");
  assert.equal(candidateQueries[0].filter.campaignId, "campaign-1");
  assert.equal(candidateQueries[0].filter.purposeGroup, "MARKETING");
  assert.equal(candidateQueries[0].filter.from, undefined);
  assert.equal((candidateQueries[0].filter.to as Date).toISOString(), preflight.range.to);
});
