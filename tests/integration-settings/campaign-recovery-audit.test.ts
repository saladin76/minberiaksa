/* eslint-disable @typescript-eslint/no-explicit-any -- Partial read-only database and service fault fixtures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const nativeImport = new Function('path', 'return import(path)') as (path: string) => Promise<{auditCampaignRecoveryReadOnly: (input: any) => Promise<any>; recoveryReadFailure: (error: unknown) => string}>;
const modulePromise = nativeImport(pathToFileURL(resolve('scripts/audit-campaign-recovery-readonly.mjs')).href);
function fixture() {
 return {name:'Oct31',prisma:{communicationCampaign:{findMany:async()=>[{id:'private-id',status:'BLOCKED'}]}},readCampaign:async()=>({status:'BLOCKED'}),readCoverage:async()=>({ok:true,missingWithRecipients:[],undecided:[]}),readControls:async()=>({ok:true})};
}

test('campaign audit reads bounded selection and partial checks without queueing or printing contacts and identifiers', async () => {
 const { auditCampaignRecoveryReadOnly } = await modulePromise;
 const events: any[] = []; let query: any, reads = 0;
 const report = await auditCampaignRecoveryReadOnly({...fixture(),prisma:{communicationCampaign:{findMany:async(value:any)=>{query=value;return[{id:'private-id',status:'BLOCKED'}];}}},readCoverage:async()=>{reads++;return{ok:false,missingWithRecipients:[{locale:'tr',label:'private',recipientCount:3}],undecided:['tr']};},emit:(event:any)=>events.push(event)});
 assert.equal(query.take,11);assert.deepEqual(query.select,{id:true,status:true});assert.equal(query.where.name.mode,'insensitive');assert.equal(reads,1);
 assert.equal(report.complete,true);assert.equal(report.fullRecoveryChecked,false);assert.equal(report.results[0].providerReadiness,'NOT_EVALUATED');assert.equal(report.results[0].coverageOk,false);
 assert.equal(report.providerCalls+report.databaseWrites+report.recipientMessages+report.cronRequests,0);assert.ok(events.some(event=>event.stage==='COVERAGE'));
 assert.equal(report.results[0].canResume,undefined);assert.doesNotMatch(JSON.stringify(report),/private-id|secret|private/);
});

test('campaign audit never interprets a failed read as zero missing languages or exposes the error body', async () => {
 const { auditCampaignRecoveryReadOnly,recoveryReadFailure } = await modulePromise;
 for(const [error,expected] of [[new Error('ONE_ACTIVE_DEFAULT_WHATSAPP_SENDER_REQUIRED'),'DEFAULT_WHATSAPP_SENDER_REQUIRED'],[new Error('mongodb://secret:password@private.example'),'READ_FAILED'],[Object.assign(new Error('private'),{code:'P2024'}),'READ_TIMEOUT']] as const){
  const report=await auditCampaignRecoveryReadOnly({...fixture(),readCoverage:async()=>{throw error;}});
  assert.equal(report.complete,true);assert.equal(report.results[0].ok,false);assert.equal(report.results[0].failures[0].stage,'COVERAGE');assert.equal(report.results[0].failures[0].failure,expected);assert.equal(recoveryReadFailure(error),expected);assert.doesNotMatch(JSON.stringify(report),/mongodb|password|private/);
 }
});

test('invalid or broad campaign filters cannot inspect arbitrary campaigns', async () => {
 const { auditCampaignRecoveryReadOnly }=await modulePromise;let reads=0,inspections=0;
 const args={...fixture(),prisma:{communicationCampaign:{findMany:async()=>{reads++;return Array.from({length:11},()=>({id:'id',status:'BLOCKED'}));}}},readCampaign:async()=>{inspections++;throw Error('must not inspect');}};
 await assert.rejects(auditCampaignRecoveryReadOnly({...args,name:''}),/CAMPAIGN_NAME_FILTER_REQUIRED/);assert.equal(reads,0);
 const result=await auditCampaignRecoveryReadOnly({...args,name:'Oct31'});assert.equal(result.complete,false);assert.equal(result.failure,'CAMPAIGN_FILTER_TOO_BROAD');assert.equal(inspections,0);
});

test('a failed coverage check waits for the independent controls read before diagnostic teardown', async () => {
 const {auditCampaignRecoveryReadOnly}=await modulePromise;let finished=false;
 const result=await auditCampaignRecoveryReadOnly({...fixture(),readCoverage:async()=>{throw Error('private failure');},readControls:async()=>{await new Promise(resolve=>setTimeout(resolve,20));finished=true;return{ok:true};}});
 assert.equal(finished,true);assert.equal(result.results[0].ok,false);assert.equal(result.results[0].failures.length,1);
});

test('the real CLI suppresses a dependency logging a private database error before it throws', async () => {
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawnSync}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'minberi-readonly-cli-'));
 try{
  const preload=join(dir,'preload.mjs');writeFileSync(preload,`globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};globalThis.prisma={communicationCampaign:{findMany:async()=>[{id:'${'a'.repeat(24)}',status:'BLOCKED'}],findUnique:async()=>{console.error('PRIVATE_DATABASE_DETAILS');console.log('PRIVATE_DATABASE_DETAILS');throw Error('mongodb://secret:password@private.example');}},$disconnect:async()=>{}};globalThis.prismaBankLedgerPrivate=globalThis.prisma;`);
  const result=spawnSync(process.execPath,['--conditions=react-server','--import','tsx','--import',preload,'scripts/audit-campaign-recovery-readonly.mjs','--name=Oct31'],{cwd:process.cwd(),encoding:'utf8',timeout:20000,env:{...process.env,DATABASE_URL:'mongodb://127.0.0.1:1/qa?serverSelectionTimeoutMS=100',STRIPE_SECRET_KEY:'sk_test_fixture_no_network',NEXTAUTH_SECRET:'fixture'}});
  assert.equal(result.status,1);assert.match(result.stdout,/READ_FAILED/);assert.match(result.stdout,/"databaseWrites": 0/);assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE_DATABASE_DETAILS|secret:password|private\.example/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
