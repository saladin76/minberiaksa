#!/usr/bin/env node
/**
 * PR #202 — read-only authenticated staging acceptance.
 *
 * Usage:
 *   STAGING_URL=https://staging.example.org \
 *   STAGING_ALLOWED_HOST=staging.example.org \
 *   STAGING_ADMIN_COOKIE='next-auth.session-token=...' \
 *   node scripts/dashboard-pr202-staging-acceptance.mjs
 *
 * Required: STAGING_REVENUE_STAFF_COOKIE, STAGING_DENIED_STAFF_COOKIE,
 * STAGING_DONOR_COOKIE. Optional: STAGING_QUERY (extra category/campaign/provider/locale/country
 * /donationType/userId filters), STAGING_START, STAGING_END.
 *
 * Never prints cookies, donor identities, API JSON bodies, or row identifiers.
 * Every request is GET. Refuses the production hostname by default.
 */
const urlInput = process.env.STAGING_URL;
if (!urlInput) {
  console.error("Missing STAGING_URL (isolated staging server required).");
  process.exit(2);
}
const root = new URL(urlInput);
if (!["http:", "https:"].includes(root.protocol)) throw Error("HTTP(S) staging URL required");
if (root.username || root.password) throw Error("Credentials must not be embedded in URL");
const host = root.hostname.toLowerCase().replace(/\.$/, "");
if (host === "minberiaksa.org" || host === "www.minberiaksa.org" ||
    host.endsWith(".minberiaksa.org") && !host.startsWith("staging.") && !host.startsWith("test.")) {
  throw Error("Refusing production Minber hostname");
}
// Cookies are security credentials: never transmit them to an unintended host
// because of a typo, redirected URL, or insecure network transport.
const approvedHost = process.env.STAGING_ALLOWED_HOST?.trim().toLowerCase().replace(/[.]$/, "");
if (!approvedHost || approvedHost !== host) {
  throw Error("STAGING_ALLOWED_HOST must explicitly match the isolated staging hostname");
}
const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
if (root.protocol !== "https:" && !loopback) {
  throw Error("External staging must use HTTPS to protect session cookies");
}
if (root.pathname !== "/" || root.search || root.hash) {
  throw Error("STAGING_URL must be a staging origin without a path, query or fragment");
}
if (!process.env.STAGING_ADMIN_COOKIE) throw Error("Missing STAGING_ADMIN_COOKIE");
const start = process.env.STAGING_START ?? "2026-11-10";
const end = process.env.STAGING_END ?? "2026-11-11";
if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
  throw Error("Valid ordered Istanbul YYYY-MM-DD start/end required");
}
const extra = new URLSearchParams(process.env.STAGING_QUERY ?? "");
const allow = new Set(["categoryId", "campaignId", "userId", "locale", "country", "provider", "donationType"]);
for (const key of extra.keys()) if (!allow.has(key)) throw Error("Unsupported STAGING_QUERY key: " + key);
const sessions = [
  ["ADMIN", process.env.STAGING_ADMIN_COOKIE, 200],
  ["REVENUE_STAFF", process.env.STAGING_REVENUE_STAFF_COOKIE, 200],
  ["DENIED_STAFF", process.env.STAGING_DENIED_STAFF_COOKIE, 403],
  ["DONOR", process.env.STAGING_DONOR_COOKIE, 403],
];
const missingSessions = sessions.filter(([, cookie]) => !cookie).map(([label]) => label);
if (missingSessions.length) {
  throw Error("Missing isolated staging cookies for roles: " + missingSessions.join(", "));
}

function requestUrl(path, params) {
  const u = new URL(path, root);
  for (const [k,v] of params) u.searchParams.set(k,v);
  return u;
}
async function get(path, params, cookie, expectedStatus=200) {
  const u = requestUrl(path, params);
  const response = await fetch(u, {
    method: "GET", headers: { Cookie: cookie, Accept: "application/json" },
    redirect: "manual", signal: AbortSignal.timeout(30000),
  });
  if (response.status !== expectedStatus) {
    throw Error(path + " expected HTTP " + expectedStatus + ", received " + response.status);
  }
  if (response.status !== 200) return null;
  return response.json();
}
function cents(n) { return Math.round((Number(n) || 0)*100); }
function rowUsd(row) {
  const amountUsd=Number(row.amountUSD);
  if (Number.isFinite(amountUsd) && amountUsd>0) return amountUsd;
  return row.currency==="USD" && Number.isFinite(Number(row.amount)) ? Number(row.amount) : 0;
}
function effectivePaid(row) { return row.status==="PAID" && row.paidAt != null; }
function chartCounts(rows) {
  return rows.reduce((o,r)=>({
    paid:o.paid+(Number(r.count)||0),
    failed:o.failed+(Number(r.countFailed)||0),
    pending:o.pending+(Number(r.countPending)||0),
    usd:o.usd+(Number(r.amountUSD)||0),
  }),{paid:0,failed:0,pending:0,usd:0});
}
function listCounts(rows) {
  return rows.reduce((o,r)=>{
    if (effectivePaid(r)) {o.paid++;o.usd+=rowUsd(r);}
    else if(r.status==="FAILED" && r.paidAt==null) o.failed++;
    else if(r.status==="PAID" && r.paidAt==null) o.pending++;
    return o;
  },{paid:0,failed:0,pending:0,usd:0});
}
// Independently reconstruct Istanbul daily buckets from the complete ledger.
// Matching aggregate totals is insufficient: a charge could be assigned to
// the wrong calendar day while the overall total still appears correct.
const istanbulFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
});
function istanbulDateKey(raw) {
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) throw Error("Invalid date in staging financial row");
  const parts = Object.fromEntries(istanbulFormatter.formatToParts(date).map(p => [p.type, p.value]));
  return [parts.year,parts.month,parts.day].join("-");
}
function emptyTotals() { return {paid:0,failed:0,pending:0,usd:0}; }
function dailyChartTotals(rows) {
  const daily = new Map();
  for(const r of rows) {
    const key = r.date;
    if(typeof key!=="string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(key) || daily.has(key)) {
      throw Error("Malformed or repeated financial chart date");
    }
    daily.set(key,{paid:Number(r.count)||0,failed:Number(r.countFailed)||0,
      pending:Number(r.countPending)||0,usd:Number(r.amountUSD)||0});
  }
  return daily;
}
function dailyLedgerTotals(rows) {
  const daily = new Map();
  for(const r of rows) {
    const paid = effectivePaid(r);
    const failed = r.status==="FAILED" && r.paidAt==null;
    const pending = r.status==="PAID" && r.paidAt==null;
    if(!paid && !failed && !pending) throw Error("Unrecognized or contradictory financial ledger row");
    const key = istanbulDateKey(paid ? r.paidAt : r.createdAt);
    const totals = daily.get(key) ?? emptyTotals();
    totals.paid += Number(paid);
    totals.failed += Number(failed);
    totals.pending += Number(pending);
    if(paid) totals.usd += rowUsd(r);
    daily.set(key,totals);
  }
  return daily;
}
function equalDailyBuckets(chart,ledger) {
  const keys = new Set([...chart.keys(),...ledger.keys()]);
  for(const key of keys) {
    const a=chart.get(key)??emptyTotals(), b=ledger.get(key)??emptyTotals();
    if(a.paid!==b.paid || a.failed!==b.failed || a.pending!==b.pending
       || Math.abs(cents(a.usd)-cents(b.usd))>2) return false;
  }
  return true;
}
const statusCases=["PAID","FAILED","PENDING","RESOLVED","all"];
let failures=0;
let paidCoverage=0;
let failedCoverage=0;
let pendingCoverage=0;
let crossDaySettlements=0;
for(const [label,cookie,expected] of [...sessions, ["ANONYMOUS", "", 401]]){
  const o=await get("/api/admin/dashboard-filter-options",new URLSearchParams([["locale","ar"]]),cookie,expected);
  const c=await get("/api/admin/donations/chart",new URLSearchParams([["period","custom"],["start",start],["end",end],["status","PAID"]]),cookie,expected);
  if(expected===200 && (!Array.isArray(o?.items)||!Array.isArray(c))) throw Error(label+" invalid financial API response");
  console.log(label+": filter options/chart HTTP "+expected);
}
for(const [label,cookie] of sessions.filter(([, , expected]) => expected === 200)){
  const p=new URLSearchParams([["start",start],["end",end],["status","PAID"],["dateBasis","accounting"],["limit","1"]]);
  const data=await get("/api/donations",p,cookie);
  if(!Array.isArray(data?.donations))throw Error(label+" invalid authorized donation list response");
  console.log(label+": authorized accounting donation list HTTP 200");
}
for(const status of statusCases){
  const params=new URLSearchParams(extra);
  params.set("period","custom");params.set("start",start);params.set("end",end);params.set("status",status);
  const chart=await get("/api/admin/donations/chart",params,process.env.STAGING_ADMIN_COOKIE);
  if(!Array.isArray(chart))throw Error("Invalid chart JSON for "+status);
  params.delete("period");params.set("dateBasis","accounting");params.set("page","1");params.set("limit","100");
  const pages=[];let reportedTotal=null,reportedPages=null;
  for(let page=1;page<=1000;page++){
    params.set("page",String(page));
    const data=await get("/api/donations",params,process.env.STAGING_ADMIN_COOKIE);
    if(!Array.isArray(data?.donations))throw Error("Invalid list JSON at page "+page);
    if(reportedTotal===null){
      reportedTotal=Number(data.pagination?.total);
      reportedPages=Number(data.pagination?.pages);
      if(!Number.isInteger(reportedTotal)||!Number.isInteger(reportedPages)||reportedPages>1000)throw Error("Invalid or excessive listing pagination");
    }
    if(Number(data.pagination?.total)!==reportedTotal || Number(data.pagination?.pages)!==reportedPages) {
      throw Error(status+": pagination totals changed during read-only reconciliation");
    }
    pages.push(...data.donations);
    if(page>=reportedPages)break;
  }
  if(pages.length!==reportedTotal)throw Error(status+": pagination incomplete ("+pages.length+"/"+reportedTotal+")");
  // Duplicate rows between pages can accidentally conceal omissions. Do not
  // print row identifiers; only confirm they exist and are globally unique.
  const ids = pages.map(row=>row.id);
  if(ids.some(id=>typeof id!=="string" || !id) || new Set(ids).size!==ids.length) {
    throw Error(status+": invalid or duplicate donation IDs across paginated results");
  }
  if(status==="FAILED") failedCoverage=pages.filter(r => r.status==="FAILED" && r.paidAt==null).length;
  if(status==="PENDING") pendingCoverage=pages.filter(r => r.status==="PAID" && r.paidAt==null).length;
  if(status==="PAID") {
    paidCoverage=pages.filter(effectivePaid).length;
    crossDaySettlements=pages.filter(r => effectivePaid(r) &&
      istanbulDateKey(r.paidAt) !== istanbulDateKey(r.createdAt)
    ).length;
  }
  const a=chartCounts(chart),b=listCounts(pages);
  const expectedPaid=status==="FAILED"||status==="PENDING"?0:a.paid;
  const expectedFailed=status==="PAID"||status==="PENDING"?0:a.failed;
  const expectedPending=status==="PAID"||status==="FAILED"||status==="RESOLVED"?0:a.pending;
  const dailyMatch = equalDailyBuckets(dailyChartTotals(chart),dailyLedgerTotals(pages));
  const equal=a.paid===b.paid && a.failed===b.failed && a.pending===b.pending &&
    Math.abs(cents(a.usd)-cents(b.usd))<=Math.max(2,2*chart.length);
  const ok=dailyMatch && equal && a.paid===expectedPaid && a.failed===expectedFailed && a.pending===expectedPending;
  if(!ok)failures++;
  console.log(JSON.stringify({status,result:ok?"PASS":"MISMATCH",dailyMatch,
    chart:{paid:a.paid,failed:a.failed,pending:a.pending,usdCents:cents(a.usd)},
    list:{paid:b.paid,failed:b.failed,pending:b.pending,usdCents:cents(b.usd)},
    paginatedRows:pages.length}));
}
if(paidCoverage===0) {
  failures++;
  console.error("NOT COVERED: zero settled paid donations in selected staging window; empty-data parity is insufficient.");
}
if(crossDaySettlements===0) {
  failures++;
  console.error("NOT COVERED: no cross-day settled donation was exercised; seed or select an isolated staging window with delayed settlement.");
}
if(failedCoverage===0 || pendingCoverage===0) {
  failures++;
  console.error("NOT COVERED: staging must include at least one FAILED and one unconfirmed PENDING attempt in the selected window.");
}
console.log(JSON.stringify({coverage:{settledPaid:paidCoverage,failedAttempts:failedCoverage,pendingAttempts:pendingCoverage,crossDaySettlements}}));
if(failures) {
  console.error(failures+" acceptance mismatch or coverage gap(s); no financial writes performed.");
  process.exitCode=1;
} else {
  console.log("All staging acceptance comparisons and required settlement coverage passed; no donor data printed.");
}
