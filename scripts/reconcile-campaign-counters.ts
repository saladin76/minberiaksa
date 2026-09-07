/**
 * Re-derive `CommunicationCampaign` counters from the delivery rows.
 *
 * Why this exists: `executeCampaignSend` used to stamp `sentCount`/`failedCount` from what the
 * provider said during the send call. For Elastic Email that only ever means "the message was
 * ACCEPTED" — the real outcome (Suppress, Error, bounce) lands minutes later on the
 * `CommunicationDelivery` rows via the webhook / event-sync cron, and nothing carried it back up.
 * Campaigns therefore kept reporting «أُرسلت N · فشلت 0» for mail Elastic Email had refused to
 * deliver. `deliveredCount` was never written by any code path at all, so «وصلت» always read 0.
 *
 * The send path and the event pipeline now recompute counters themselves. This script fixes the
 * rows that were already written before that, which nothing else revisits.
 *
 * Dry run (default, writes nothing):
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/reconcile-campaign-counters.ts
 * Apply:
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/reconcile-campaign-counters.ts --apply
 */
import { createRequire } from "node:module";

// `campaign-counter-service` pulls in modules that import "server-only", a package Next.js provides
// in-process and which does not exist in node_modules. Stub it in the CJS resolver before the app
// modules are loaded — it is a compile-time marker with no behaviour. The imports below are
// therefore dynamic: a static `import` is hoisted and would resolve before this line runs.
const nodeRequire = createRequire(__filename);
type LoaderHost = { _load(request: string, ...rest: unknown[]): unknown };
const moduleInternals = nodeRequire("node:module") as unknown as LoaderHost;
const load = moduleInternals._load.bind(moduleInternals);
moduleInternals._load = (request: string, ...rest: unknown[]) =>
  request === "server-only" ? {} : load(request, ...rest);

type PrismaClientLike = typeof import("@/lib/prisma")["prisma"];
let prisma: PrismaClientLike;

const APPLY = process.argv.includes("--apply");

async function main() {
  prisma = (await import("@/lib/prisma")).prisma;
  const { tallyDeliveryStatuses, computeFinalStatus, recomputeCampaignCounters } = await import(
    "@/lib/communication/campaign-counter-service"
  );

  const RECOMPUTABLE = new Set(["SENT", "SENT_WITH_ISSUES", "FAILED", "BLOCKED"]);

  const campaigns = await prisma.communicationCampaign.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, name: true, channel: true, status: true,
      sentCount: true, deliveredCount: true, readCount: true, clickedCount: true, failedCount: true,
    },
  });

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${campaigns.length} campaign(s)\n`);
  let drifted = 0;

  for (const campaign of campaigns) {
    const rows = await prisma.communicationDelivery.findMany({
      where: { campaignId: campaign.id },
      select: { status: true },
    });
    if (!rows.length) continue;

    const counters = tallyDeliveryStatuses(rows.map((row) => row.status));
    const status = RECOMPUTABLE.has(campaign.status)
      ? computeFinalStatus(counters.total, counters.sent, counters.skipped, counters.failed)
      : campaign.status;

    const changed =
      campaign.sentCount !== counters.sent ||
      campaign.deliveredCount !== counters.delivered ||
      campaign.readCount !== counters.read ||
      campaign.clickedCount !== counters.clicked ||
      campaign.failedCount !== counters.failed ||
      campaign.status !== status;
    if (!changed) continue;

    drifted += 1;
    console.log(`[${campaign.channel}] ${campaign.name}`);
    console.log(`   status  ${campaign.status} -> ${status}`);
    console.log(
      `   sent ${campaign.sentCount}->${counters.sent}   delivered ${campaign.deliveredCount}->${counters.delivered}` +
      `   failed ${campaign.failedCount}->${counters.failed}   (skipped ${counters.skipped}, rows ${counters.total})`,
    );

    if (APPLY) {
      const result = await recomputeCampaignCounters(campaign.id);
      console.log(`   ${result.ok ? "updated" : `FAILED: ${result.reason}`}`);
    }
  }

  console.log(`\n${drifted} campaign(s) ${APPLY ? "corrected" : "would be corrected"}.`);
  if (!APPLY && drifted) console.log("Re-run with --apply to write the corrected numbers.");
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma?.$disconnect().catch(() => {});
  process.exit(1);
});
