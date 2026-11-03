/** Read-only campaign diagnosis against the deployed source. No queue, sends,
 * provider calls, retries, cron requests or database mutations. */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadReleaseModule } from './release-metadata-runtime.mjs';

export function recoveryReadFailure(error) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'ONE_ACTIVE_DEFAULT_WHATSAPP_SENDER_REQUIRED') return 'DEFAULT_WHATSAPP_SENDER_REQUIRED';
  if (message === 'COMMUNICATION_TEMPLATE_DATABASE_UNAVAILABLE') return 'DATABASE_CONFIGURATION_REQUIRED';
  if (['CAMPAIGN_NAME_FILTER_REQUIRED', 'INVALID_AUDIENCE_LIST', 'AUDIENCE_CURSOR_NOT_ADVANCING', 'AUDIENCE_LANGUAGE_COUNTS_UNAVAILABLE', 'INVALID_AUDIENCE_LANGUAGE_COUNT'].includes(message)) return message;
  const code = error && typeof error === 'object' ? error.code : null;
  if (['P1000', 'P1001', 'P1002', 'P1017'].includes(code)) return 'DATABASE_CONNECTION_FAILED';
  if (code === 'P2024' || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))) return 'READ_TIMEOUT';
  return 'READ_FAILED';
}

export async function auditCampaignRecoveryReadOnly({ prisma, readCampaign, readCoverage, readControls, name, emit = () => {} }) {
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 80) throw new Error('CAMPAIGN_NAME_FILTER_REQUIRED');
  const report = { readOnly: true, scope: 'CAMPAIGN_COVERAGE_CONTROLS_ONLY', fullRecoveryChecked: false, checkedAt: new Date().toISOString(), complete: false, databaseWrites: 0, providerCalls: 0, recipientMessages: 0, cronRequests: 0, results: [] };
  const started = Date.now();
  async function stage(phase, read, campaign) {
    const start = Date.now(); emit({ campaign, stage: phase, state: 'STARTED' });
    try { const value = await read(); emit({ campaign, stage: phase, state: 'SUCCEEDED', elapsedMs: Date.now() - start }); return value; }
    catch (error) { emit({ campaign, stage: phase, state: 'FAILED', failure: recoveryReadFailure(error), elapsedMs: Date.now() - start }); throw error; }
  }
  try {
    const campaigns = await stage('CAMPAIGN_SELECTION', () => prisma.communicationCampaign.findMany({ where: { name: { contains: name.trim(), mode: 'insensitive' } }, orderBy: { createdAt: 'desc' }, take: 11, select: { id: true, status: true } }));
    if (campaigns.length > 10) return { ...report, failure: 'CAMPAIGN_FILTER_TOO_BROAD' };
    for (let index = 0; index < campaigns.length; index++) {
      const selected = campaigns[index], start = Date.now(), ordinal = index + 1;
      try {
        const campaign = await stage('CAMPAIGN', () => readCampaign(selected.id), ordinal);
        if (!campaign) { report.results.push({ campaign: ordinal, ok: false, failure: 'CAMPAIGN_NOT_FOUND' }); continue; }
        // Wait for both reads before teardown even if one fails. Do not call
        // planCampaignSend/loadCampaignRecipients: legacy paths may bootstrap profiles.
        const results = await Promise.allSettled([
          stage('COVERAGE', () => readCoverage(selected.id), ordinal),
          stage('CONTROLS', () => readControls(campaign), ordinal),
        ]);
        const failures = results.flatMap((result, i) => result.status === 'rejected' ? [{stage:i === 0 ? 'COVERAGE' : 'CONTROLS', failure:recoveryReadFailure(result.reason)}] : []);
        const elapsedMs = Date.now() - start;
        if (failures.length) { report.results.push({ campaign: ordinal, status: selected.status, ok: false, failures, elapsedMs }); continue; }
        const coverage = results[0].value, controls = results[1].value;
        report.results.push({ campaign: ordinal, status: campaign.status, ok: true, coverageOk: coverage.ok, controlsOk: controls.ok, controlBlock: controls.ok ? null : controls.reason, missingLanguages: coverage.missingWithRecipients.map(row => ({ locale: row.locale, recipientCount: row.recipientCount })), undecided: coverage.undecided, providerReadiness: 'NOT_EVALUATED', elapsedMs, exceedsBrowserDeadline: elapsedMs >= 30000 });
      } catch (error) { report.results.push({ campaign: ordinal, status: selected.status, ok: false, failure: recoveryReadFailure(error), elapsedMs: Date.now() - start }); }
    }
    return { ...report, complete: true, matched: campaigns.length, elapsedMs: Date.now() - started };
  } catch (error) { return { ...report, failure: recoveryReadFailure(error), elapsedMs: Date.now() - started }; }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !args[0].startsWith('--name=')) throw new Error('CAMPAIGN_NAME_FILTER_REQUIRED');
  const name = args[0].slice(7);
  if (name.trim().length < 2 || name.length > 80) throw new Error('CAMPAIGN_NAME_FILTER_REQUIRED');
  createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const { prisma } = await loadReleaseModule('lib/prisma.ts');
  try {
    const [{ getCampaign }, { evaluateCoverageGate }, { evaluateCampaignSendControls }] = await Promise.all([
      loadReleaseModule('lib/communication/campaign-service.ts'), loadReleaseModule('lib/communication/campaign-approval-service.ts'), loadReleaseModule('lib/communication/campaign-send-controls.ts'),
    ]);
    const report = await auditCampaignRecoveryReadOnly({ prisma, readCampaign: getCampaign, readCoverage: evaluateCoverageGate, readControls: evaluateCampaignSendControls, name, emit: event => console.log(JSON.stringify({ readOnly: true, ...event })) });
    console.log(JSON.stringify(report, null, 2));
    if (!report.complete || report.results.some(row => !row.ok)) process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main().catch(error => {
  console.error(JSON.stringify({ readOnly: true, complete: false, stage: 'RUNTIME', failure: recoveryReadFailure(error), databaseWrites: 0, providerCalls: 0, recipientMessages: 0 }));
  process.exitCode = 1;
});
