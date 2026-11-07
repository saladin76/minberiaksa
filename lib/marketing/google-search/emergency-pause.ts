import { prisma } from "@/lib/prisma";
import { queueAuditLog } from "@/lib/audit-log";
import { googleSearchClient, searchCredentials } from "./client";
import { jsonValue } from "./json";

/** Disables automation first. It never waits for a worker lease or a budget/name match. */
export async function emergencyPauseSearchPlan(id: string) {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error("INVALID_PLAN_ID");
  const plan = await prisma.googleSearchPlan.findUnique({ where: { id } });
  if (!plan) throw new Error("PLAN_NOT_FOUND");
  const stopped = await prisma.googleSearchPlan.updateMany({ where: { id }, data: { automationEnabled: false, status: "PAUSING", version: { increment: 1 } } });
  if (stopped.count !== 1) throw new Error("EMERGENCY_PAUSE_NOT_RECORDED");
  const operationMayStillComplete=(["CREATING","CHANGING"].includes(plan.status) || Boolean((plan.evidence as Record<string,unknown>|null)?.emergencyPausePending)) && Boolean(plan.workLeaseUntil && new Date(plan.workLeaseUntil).getTime()>Date.now());
  let names: string[] = [], paused: string[] = [], removed: string[] = [], unresolved: string[] = [];
  try {
    // Credentials may still stop ads after the connection was disabled locally.
    const connection = await prisma.marketingPlatformConnection.findFirst({ where: { id: plan.connectionId, platform: "GOOGLE_ADS" } });
    if (!connection) throw new Error("ACCOUNT_NOT_AVAILABLE");
    const client = await googleSearchClient(searchCredentials(connection));
    const recorded = (plan.resources as { campaigns?: unknown } | null)?.campaigns;
    if (Array.isArray(recorded) && recorded.length) {
      if (recorded.some(value => typeof value !== "string" || !new RegExp(`^customers/${client.id}/campaigns/\\d+$`).test(value))) throw new Error("INVALID_RESOURCE_SCOPE");
      names = [...new Set(recorded as string[])];
    } else if (["CREATING", "CHANGING", "RECONCILE_REQUIRED", "PARTIAL_PROVIDER_STATE", "PAUSING"].includes(plan.status)) {
      const discovered = await client.query(`SELECT campaign.resource_name, campaign.name FROM campaign WHERE campaign.name LIKE 'Minber ${id} | %' AND campaign.status != 'REMOVED'`);
      if (discovered.some(row => !String(row.campaign.name).startsWith(`Minber ${id} | `) || !new RegExp(`^customers/${client.id}/campaigns/\\d+$`).test(row.campaign.resourceName))) throw new Error("INVALID_RESOURCE_SCOPE");
      names = [...new Set(discovered.map(row => row.campaign.resourceName))];
    }
    if (names.length) {
      // One removed or renamed campaign cannot stop the remaining pause operations.
      await client.call("googleAds:mutate", { mutateOperations: names.map(resourceName => ({ campaignOperation: { update: { resourceName, status: "PAUSED" }, updateMask: "status" } })), partialFailure: true, validateOnly: false });
      const rows = await client.query(`SELECT campaign.resource_name, campaign.name, campaign.status FROM campaign WHERE campaign.resource_name IN (${names.map(name => `'${name}'`).join(",")})`);
      if (rows.some(row => !names.includes(row.campaign.resourceName))) throw new Error("INVALID_RESOURCE_SCOPE");
      paused = names.filter(name => rows.some(row => row.campaign.resourceName === name && row.campaign.status === "PAUSED"));
      removed = names.filter(name => rows.some(row => row.campaign.resourceName === name && row.campaign.status === "REMOVED"));
      unresolved = names.filter(name => !paused.includes(name) && !removed.includes(name));
    }
  } catch (error) {
    unresolved = names.length ? names.filter(name => !paused.includes(name) && !removed.includes(name)) : ["PROVIDER_SCOPE_UNCONFIRMED"];
    const latest = await prisma.googleSearchPlan.findUniqueOrThrow({ where: { id } });
    const evidence = { ...((latest.evidence || {}) as Record<string, unknown>), emergencyPausePending:true, emergencyPause: { at: new Date().toISOString(), paused, removed, unresolved, automationDisabled: true, confirmed: false } };
    await prisma.googleSearchPlan.updateMany({ where: { id, version: latest.version, status: "PAUSING" }, data: { status: "RECONCILE_REQUIRED", lastError: "EMERGENCY_PAUSE_UNCONFIRMED", evidence: jsonValue(evidence), version: { increment: 1 } } });
    queueAuditLog({ actorRole: "SYSTEM", action: "GOOGLE_SEARCH_EMERGENCY_PAUSE", entityType: "GoogleSearchPlan", entityId: id, messageAr: "عُطلت متابعة الخطة؛ لم يتأكد إيقاف كل الحملات لدى Google", metadata: evidence.emergencyPause });
    // The caller must see an unconfirmed outcome rather than a false successful stop.
    throw new Error(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "EMERGENCY_PAUSE_UNCONFIRMED");
  }
  if(operationMayStillComplete)unresolved.push("PROVIDER_OPERATION_STILL_SETTLING");
  const latest = await prisma.googleSearchPlan.findUniqueOrThrow({ where: { id } });
  const evidence = { ...((latest.evidence || {}) as Record<string, unknown>), emergencyPausePending:unresolved.length>0, emergencyPause: { at: new Date().toISOString(), paused, removed, unresolved, automationDisabled: true, confirmed: unresolved.length === 0 } };
  const result = await prisma.googleSearchPlan.updateMany({ where: { id, version: latest.version, status: "PAUSING" }, data: { status: unresolved.length ? "RECONCILE_REQUIRED" : names.length ? "PAUSED" : plan.status === "CREATING" ? "RECONCILE_REQUIRED" : plan.status,
    lastError: unresolved.length ? "EMERGENCY_PAUSE_PARTIAL" : null, evidence: jsonValue(evidence), ...(names.length ? { resources: jsonValue({ ...((plan.resources || {}) as Record<string, unknown>), campaigns: names }) } : {}), version: { increment: 1 } } });
  if (result.count !== 1) throw new Error("EMERGENCY_PAUSE_STATE_CHANGED_REVIEW_REQUIRED");
  queueAuditLog({ actorRole: "SYSTEM", action: "GOOGLE_SEARCH_EMERGENCY_PAUSE", entityType: "GoogleSearchPlan", entityId: id, messageAr: `إيقاف طارئ: تأكد إيقاف ${paused.length} حملة وتعذر تأكيد ${unresolved.length}`, metadata: evidence.emergencyPause });
  return prisma.googleSearchPlan.findUniqueOrThrow({ where: { id } });
}
