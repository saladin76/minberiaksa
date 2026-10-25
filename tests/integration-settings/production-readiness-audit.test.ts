import test from "node:test";
import { execFileSync } from "node:child_process";

function run(source: string) {
  execFileSync(process.execPath, ["--input-type=module", "-e", `import assert from "node:assert/strict"; import * as audit from "./scripts/audit-production-readiness.mjs"; ${source}`], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], timeout: 8000 });
}
test("production preflight distinguishes eligible, abandoned, undated, Stripe and unlinked plans without exposing identifiers", () => run(`
  const base = { provider: "ALBARAKA", frequency: "DAILY", status: "ACTIVE", paymentCardId: "private-card-reference", lastBillingDate: "2026-10-23", nextBillingDate: "2026-10-24", _count: { donations: 1 } };
  const result = audit.subscriptionCounts([base, {...base, _count:{donations:0}}, {...base,lastBillingDate:null}, {...base,provider:"STRIPE",stripeSubscriptionId:"sub_private"}, {...base,provider:null,paymentCardId:null}], new Date("2026-10-25"));
  assert.equal(result["ALBARAKA/DAILY"].active,3); assert.equal(result["ALBARAKA/DAILY"].eligibleForScheduler,1);
  assert.equal(result["ALBARAKA/DAILY"].awaitingFirstPayment,1); assert.equal(result["ALBARAKA/DAILY"].paidWithoutBillingDate,1);
  assert.equal(result["STRIPE/DAILY"].eligibleForScheduler,0); assert.equal(result["UNLINKED/DAILY"].missingPaymentMethod,1);
  assert.ok(!JSON.stringify(result).includes("private"));
`));
test("cron audit reports recent route outcomes and excludes response bodies and old attempts", () => run(`
  const result = audit.cronLogSummary("2026-10-25T07:00:00Z /api/cron/recurring-charges HTTP 000 private-contact-secret\\n2026-10-25T07:15:00Z /api/cron/recurring-charges HTTP 200 card-token-secret\\n2026-10-20T00:00:00Z /api/cron/recurring-charges HTTP 000 old",new Date("2026-10-25T08:00:00Z"));
  assert.equal(result["/api/cron/recurring-charges"].attempts,2);assert.equal(result["/api/cron/recurring-charges"].lastStatus,"200");assert.equal(result["/api/cron/recurring-charges"].connectionFailures,1);
  assert.ok(!JSON.stringify(result).includes("secret"));
`));
test("loopback preflight ignores external/credentialed overrides and never constructs a charge URL", () => run(`
  for(const override of ["https://example.invalid/", "http://user:password@localhost:3000/", "http://localhost:3000/?token=secret"]) {
    const bases = audit.localProbeBases(override,"malformed"); assert.equal(bases.length,3); assert.ok(bases.every(b=>!b.includes("password")&&!b.includes("token=")&&!b.includes("example")));
  }
  assert.equal(audit.localProbeBases("http://[::1]:4000", "3000")[0], "http://[::1]:4000");
`));
test("Search Console preflight verifies the actual matching property even when GA4 permission is denied", () => run(`
  const calls=[];const scopes=[];
  const result=await audit.auditGooglePermissions({account:{client_email:"fixture@example.iam.gserviceaccount.com",private_key:"never-print-key"},propertyId:"123456",origin:"https://minberiaksa.org",getToken:async scope=>{scopes.push(scope);return "never-print-token";},request:async(url,init)=>{
    calls.push([url,init]);if(url.includes("analyticsdata"))return{ok:false,status:403};
    if(url.endsWith("/sites"))return{ok:true,json:async()=>({siteEntry:[{siteUrl:"sc-domain:unrelated.org",permissionLevel:"siteOwner"},{siteUrl:"sc-domain:minberiaksa.org",permissionLevel:"siteRestrictedUser"}]})};
    return{ok:true,status:200};
  }});
  assert.equal(result.ga4.status,"access_denied");assert.equal(result.searchConsole.status,"ready");assert.equal(result.searchConsole.property,"sc-domain:minberiaksa.org");assert.equal(calls.length,3);
  assert.ok(scopes.every(s=>s.endsWith(".readonly"))); assert.ok(!JSON.stringify(result).includes("never-print"));
`));
test("Search Console preflight cannot accept a property of a different site or an unverified property", () => run(`
  for(const scenario of [{override:"sc-domain:other.org",permission:"siteOwner",expected:"property_host_mismatch"},{override:undefined,permission:"siteUnverifiedUser",expected:"property_access_missing"}]) {
    let queries=0;const result=await audit.auditGooglePermissions({account:{client_email:"fixture@example.invalid",private_key:"key"},origin:"https://minberiaksa.org",propertyOverride:scenario.override,getToken:async()=>"token",request:async(url)=>{if(url.endsWith("/sites"))return{ok:true,json:async()=>({siteEntry:[{siteUrl:"sc-domain:minberiaksa.org",permissionLevel:scenario.permission}]})};queries++;throw Error("Must not query an unavailable property");}});
    assert.equal(result.searchConsole.status,scenario.expected);assert.equal(queries,0);
  }
`));
test("provider check only retrieves model metadata and never sends a generation request", () => run(`
  let calls=0;const result=await audit.auditOpenAiAccess({OPENAI_API_KEY:"do-not-log",AI_CORE_ENABLE_EXTERNAL_CALLS:"true",AI_CORE_OPENAI_MODEL:"gpt-4o-mini"},async(url,init)=>{calls++;assert.equal(url,"https://api.openai.com/v1/models/gpt-4o-mini");assert.equal(init.body,undefined);return{ok:true,status:200};});
  assert.equal(result.status,"model_access_ready");assert.equal(result.generationRequests,0);assert.equal(calls,1);assert.ok(!JSON.stringify(result).includes("do-not-log"));
`));
test("disabled/custom AI configuration and network errors never transmit keys to an unexpected host or print them", () => run(`
  const forbidden=async()=>{throw Error("No network call allowed");};
  assert.equal((await audit.auditOpenAiAccess({OPENAI_API_KEY:"secret"},forbidden)).status,"not_ready");
  assert.equal((await audit.auditOpenAiAccess({OPENAI_API_KEY:"secret",AI_CORE_ENABLE_EXTERNAL_CALLS:"true",AI_CORE_OPENAI_BASE_URL:"https://unknown.invalid/v1"},forbidden)).status,"custom_endpoint_not_probed");
  const result=await audit.auditOpenAiAccess({OPENAI_API_KEY:"secret",AI_CORE_ENABLE_EXTERNAL_CALLS:"true"},async()=>{throw Error("secret-key-and-details");}); assert.equal(result.status,"network_failed");assert.ok(!JSON.stringify(result).includes("secret"));
`));
