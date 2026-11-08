#!/usr/bin/env node
/**
 * READ-ONLY: Diagnose DONATION_LAPSED email delivery vs provider event outcomes.
 * Run via "git show FETCH_HEAD:scripts/audit-lapsed-email-event-causes-readonly.mjs | node --input-type=module".
 * No provider calls, no sends, no changes. Never prints recipient IDs/addresses,
 * provider message IDs, donor data, free-text errors, URL, tokens or contents.
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(resolve(process.cwd(), "package.json"));
require("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient({ log: [] });
const since = new Date("2026-11-06T00:00:00.000Z");
const until = new Date("2026-11-09T00:00:00.000Z");
const deliveryMax = 12000, eventMax = 30000;
const output = {
  periodUTC: [since.toISOString(), until.toISOString()],
  readOnly: true, providerRequests: 0, writes: 0, messagesSent: 0,
};
const count = (bag, key) => { bag[key] = (bag[key] || 0) + 1; };
const knownEventTypes = new Set([
  "sent","delivered","opened","open","clicked","click","linkclicked",
  "unsubscribed","unsubscribe","bounced","bounce","hardbounce","softbounce",
  "error","failed","abusereport","abuse","spam","spamcomplaint","complaint",
  "complained","suppressed","suppress","notdelivered","invalid",
]);
const eventLabel = raw => {
  const label = String(raw ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return knownEventTypes.has(label) ? label.toUpperCase() : "OTHER_OR_UNKNOWN_EVENT";
};
function reasonCategory(value) {
  const s = String(value || "").toLowerCase();
  if (!s.trim()) return "NO_RECORDED_DETAIL";
  if (/trust.level|permitted on your account|account.*restrict|account.*trust/.test(s)) return "ACCOUNT_TRUST_OR_RESTRICTION";
  if (/access denied|unauthoriz|invalid.api.key/.test(s)) return "ACCESS_OR_AUTH";
  if (/suppress/.test(s)) return "SUPPRESSED";
  if (/hard.bounce|soft.bounce|bounce/.test(s)) return "BOUNCE";
  if (/spam|reputat|blacklist|blocklist/.test(s)) return "SPAM_OR_REPUTATION";
  if (/invalid.*(mailbox|recipient|address)|unknown.user|no.such.user|does.not.exist/.test(s)) return "INVALID_ADDRESS";
  if (/rate.limit|too.many.requests|throttl|quota/.test(s)) return "RATE_OR_QUOTA";
  if (/timeout|timed.out|connect|network|dns/.test(s)) return "NETWORK_OR_TIMEOUT";
  if (/domain|mx record/.test(s)) return "DOMAIN_RESTRICTION_OR_DNS";
  if (/policy|prohibit|not.allowed/.test(s)) return "DELIVERY_POLICY";
  return "OTHER_DETAIL";
}
function top(obj, limit=30) {
  return Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,limit)
    .map(([key,records])=>({key,records}));
}
try {
  const triggers = await db.messageTrigger.findMany({
    where: { event: "DONATION_LAPSED", channel: "EMAIL" },
    select: { templateId: true },
  });
  const templateIds = [...new Set(triggers.map(x => x.templateId))];
  if (!templateIds.length) {
    console.log(JSON.stringify({ ...output, result: "NO_EMAIL_LAPSED_TRIGGER" }, null, 2));
    process.exit(0);
  }
  const rows = [];
  let cursor;
  while (rows.length < deliveryMax) {
    const take = Math.min(400, deliveryMax - rows.length);
    const batch = await db.communicationDelivery.findMany({
      where: { origin: "TRIGGER", channel: "EMAIL",
        templateId: { in: templateIds }, createdAt: { gte: since, lt: until } },
      orderBy: { id: "asc" }, take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id:true, templateId:true, createdAt:true, status:true,
        providerMessageId:true, recipientUserId:true, errorMessage:true, variables:true },
    });
    if (!batch.length) break;
    rows.push(...batch);
    cursor = batch.at(-1).id;
    if (batch.length < take) break;
  }
  const matched = rows.filter(row => row.variables?.trigger?.event === "DONATION_LAPSED");
  const statusesByDay = {}, timesOnNov8 = {}, failedReasonFamilies = {};
  const recipients = new Map(), repeatedInSameDay = new Map();
  let failures = 0, failuresWithProviderId = 0, noDetailFailures = 0;
  const failedMessageIds = new Set();
  for (const row of matched) {
    const day = row.createdAt.toISOString().slice(0,10);
    count(statusesByDay, day+"/"+row.status);
    if (day === "2026-11-08") count(timesOnNov8, row.createdAt.toISOString().slice(11,13)+":00 UTC");
    if (row.recipientUserId) {
      const key = row.templateId+":"+row.recipientUserId;
      count(recipients, key);
      count(repeatedInSameDay, key+":"+day);
    }
    if (["FAILED","BOUNCED"].includes(row.status)) {
      failures++;
      if (row.providerMessageId) { failuresWithProviderId++; failedMessageIds.add(row.providerMessageId); }
      const cat = reasonCategory(row.errorMessage);
      count(failedReasonFamilies, cat);
      if (cat === "NO_RECORDED_DETAIL") noDetailFailures++;
    }
  }
  const providerIds = [...new Set(matched.map(r=>r.providerMessageId).filter(Boolean))];
  const failedEventsByType = {}, failedEventsByReason = {}, allEventStatus = {};
  const failedWithEvent = new Set(), failedWithTerminalEvent = new Set();
  let eventsScanned = 0, eventTruncated = false;
  for(let i=0; i<providerIds.length; i+=150) {
    if(eventsScanned >= eventMax) {eventTruncated=true;break;}
    const inIds = providerIds.slice(i,i+150);
    let eventCursor;
    while(eventsScanned < eventMax) {
      const take = Math.min(500,eventMax-eventsScanned);
      const batch = await db.communicationProviderEvent.findMany({
        where: { channel: "EMAIL", providerMessageId: { in: inIds } },
        orderBy: { id: "asc" }, take,
        ...(eventCursor ? { cursor: { id: eventCursor }, skip: 1 } : {}),
        select: { id:true, providerMessageId:true, eventType:true,
          status:true, errorMessage:true },
      });
      if(!batch.length) break;
      eventsScanned += batch.length;
      for(const ev of batch) {
        const type = eventLabel(ev.eventType);
        const status = String(ev.status || "UNKNOWN").toUpperCase();
        count(allEventStatus, type+"/"+(["FAILED","BOUNCED","SENT","DELIVERED","OPENED","CLICKED","UNSUBSCRIBED"].includes(status) ? status : "OTHER"));
        if(!failedMessageIds.has(ev.providerMessageId)) continue;
        failedWithEvent.add(ev.providerMessageId);
        if(["FAILED","BOUNCED"].includes(status)) {
          failedWithTerminalEvent.add(ev.providerMessageId);
          count(failedEventsByType,type);
          count(failedEventsByReason,reasonCategory(ev.errorMessage));
        }
      }
      eventCursor = batch.at(-1).id;
      if(batch.length < take) break;
    }
    if(eventsScanned >= eventMax) eventTruncated = true;
  }
  console.log(JSON.stringify({
    ...output,
    totalSelected: rows.length, matchingLapsed: matched.length,
    deliveryMayBeTruncated: rows.length === deliveryMax,
    emailStatusesByCreatedDate: top(statusesByDay),
    nov8CreatedUtcHours: top(timesOnNov8),
    failed: failures, failuresWithProviderId, noDetailFailures,
    currentFailureDetailFamilies: top(failedReasonFamilies),
    matchedProviderEventsScanned: eventsScanned, providerEventMayBeTruncated: eventTruncated,
    providerEventTypesForFailedMessages: top(failedEventsByType),
    providerFailureDetailFamilies: top(failedEventsByReason),
    providerEventStatusTotals: top(allEventStatus),
    failedMessagesWithSomeProviderEvent: failedWithEvent.size,
    failedMessagesWithExplicitProviderFailedEvent: failedWithTerminalEvent.size,
    failedMessagesWithoutProviderEvent: failedMessageIds.size - failedWithEvent.size,
    recipientTemplateRepeatedAcrossWindow: [...recipients.values()].filter(n => n>1).length,
    recipientTemplateRepeatedSameDay: [...repeatedInSameDay.values()].filter(n => n>1).length,
    note: "Provider event counts are events, not unique messages. Current delivery statuses can change after a send; event types/diagnostic family are code-derived groupings only. All IDs are used in-memory and never printed."
  },null,2));
} catch {
  console.error(JSON.stringify({error:"READ_ONLY_EMAIL_EVENT_AUDIT_FAILED",readOnly:true,providerRequests:0,writes:0}));
  process.exitCode=1;
} finally {
  await db.$disconnect().catch(()=>{});
}
