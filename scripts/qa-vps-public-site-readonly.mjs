#!/usr/bin/env node
/**
 * Anonymous, bounded, GET-only production audit: live routes, 19 locales,
 * XML sitemap entries, public metadata, privacy gates, headers and assets.
 * No cookies, authorization headers, POST/PATCH, payment provider, cron or DB.
 * Only findings and counts are saved; no response bodies or donor data.
 */
import { writeFileSync } from "node:fs";

const ORIGIN = "https://minberiaksa.org";
const MAX_REQUESTS = 230;
const PAUSE_MS = 175;
const FINDINGS_LIMIT = 120;
const SITE_LOCALES = [
  "ar","tr","en","fr","de","es","id","pt","ur","sq",
  "it","nl","sv","no","da","ms","ja","zh","hi",
];
const OUT = process.env.QA_LIVE_REPORT || "/tmp/minbar-live-readonly.json";
const report = {
  kind: "minbar-live-anonymous-readonly-v1",
  checkedAt: new Date().toISOString(),
  origin: ORIGIN, localeCount: SITE_LOCALES.length,
  scope: "GET-only public pages and unauthenticated access checks",
  noPayments: true, noDonorWrites: true, noMessages: true,
  summary: { pass: 0, fail: 0, warn: 0, skip: 0, requests: 0 },
  byCategory: {}, samples: [], findings: [],
};
const visited = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function record(category, status, code, path, details = "") {
  report.summary[status]++;
  report.byCategory[category] ||= { pass: 0, fail: 0, warn: 0, skip: 0 };
  report.byCategory[category][status]++;
  if (status !== "pass" && report.findings.length < FINDINGS_LIMIT)
    report.findings.push({ severity: status, category, code, path: String(path).slice(0, 230),
      details: String(details).slice(0, 200) });
}
function isAllowed(url) {
  try {
    const u = new URL(url, ORIGIN);
    return u.protocol === "https:" && u.origin === ORIGIN &&
      !u.username && !u.password;
  } catch { return false; }
}
function isAllowedPath(path) {
  if (!isAllowed(path)) return false;
  const u = new URL(path, ORIGIN);
  return !/(^|\/)(api\/cron|dashboard|api\/webhooks|api\/payments\/|api\/cart\/payment)(\/|$)/i.test(u.pathname);
}
async function readTextLimited(response, limit) {
  if (!response.body) return { body: "", truncated: false };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "", length = 0, truncated = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > limit) { truncated = true; await reader.cancel().catch(() => {}); break; }
      body += decoder.decode(result.value, { stream: true });
    }
    body += decoder.decode();
  } finally { try { reader.releaseLock(); } catch {} }
  return { body, truncated };
}
async function request(path, limit = 900000) {
  if (!isAllowedPath(path)) return { error: "OUT_OF_SCOPE_URL" };
  const start = new URL(path, ORIGIN);
  start.hash = "";
  const key = start.href;
  if (visited.has(key)) return visited.get(key);
  if (report.summary.requests >= MAX_REQUESTS) return { error: "REQUEST_BUDGET_EXHAUSTED" };
  report.summary.requests++;
  await sleep(PAUSE_MS);
  let current = start;
  const redirects = [];
  for (let n = 0; n < 5; n++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16000);
    let response;
    try {
      response = await fetch(current.href, {
        method: "GET", redirect: "manual", signal: controller.signal,
        headers: { "User-Agent": "Googlebot", Accept: "text/html,application/xml,text/plain,application/json;q=0.8" },
      });
      if ([301,302,303,307,308].includes(response.status)) {
        const location = response.headers.get("location");
        const dest = location ? new URL(location, current) : null;
        if (!dest || !isAllowedPath(dest.href)) return { error: "REDIRECT_OUT_OF_SCOPE", status: response.status };
        redirects.push(response.status);
        current = dest;
        continue;
      }
      const page = await readTextLimited(response, limit);
      const obj = {
        status: response.status, finalUrl: current.href, redirectCodes: redirects,
        headers: {
          contentType: response.headers.get("content-type") || "",
          cache: response.headers.get("cache-control") || "",
          robots: response.headers.get("x-robots-tag") || "",
          hsts: response.headers.get("strict-transport-security") || "",
          nosniff: response.headers.get("x-content-type-options") || "",
          frame: response.headers.get("x-frame-options") || "",
          csp: response.headers.get("content-security-policy") || "",
        },
        ...page,
      };
      visited.set(key, obj);
      return obj;
    } catch (e) {
      return { error: e?.name === "AbortError" ? "TIMEOUT" : "FETCH_FAILED" };
    } finally { clearTimeout(timer); }
  }
  return { error: "REDIRECT_LOOP_OR_DEPTH" };
}
const attr = (tag, key) => {
  const match = tag.match(new RegExp("\\b" + key + "\\s*=\\s*([\"'])(.*?)\\1", "i"));
  return match?.[2] || "";
};
function links(html, desiredRel = null) {
  const tags = [...html.matchAll(/<link\b[^>]*>/gi)].map(x => x[0]);
  return tags.filter(x => !desiredRel || attr(x,"rel").toLowerCase().split(/\s+/).includes(desiredRel))
    .map(x => ({ rel: attr(x,"rel"), href: attr(x,"href"), hreflang: attr(x,"hreflang") }));
}
function tags(html, name) {
  return [...html.matchAll(new RegExp("<" + name + "\\b[^>]*>", "gi"))].map(x=>x[0]);
}
function xmlLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
    .map(x=>x[1].replace(/&amp;/g,"&"));
}
async function checkPage(path, category, indexed = false) {
  const res = await request(path);
  if (res.error) { record(category, "fail", res.error, path); return res; }
  if (res.status !== 200) { record(category, "fail", "HTTP_" + res.status, path); return res; }
  record(category, "pass", "HTTP_200", path);
  if (!/text\/html/i.test(res.headers.contentType)) {
    record(category,"warn","NOT_HTML",path,res.headers.contentType);return res;
  }
  const title = /<title[^>]*>\s*[^<]{4,}/i.test(res.body);
  if (!title) record(category,"warn","MISSING_OR_STREAMED_TITLE",path);
  const robots = res.headers.robots + " " + tags(res.body,"meta")
    .filter(t=>attr(t,"name").toLowerCase()==="robots").map(t=>attr(t,"content")).join(" ");
  if (indexed && /noindex/i.test(robots))
    record(category,"fail","PUBLIC_PAGE_NOINDEX",path);
  if (!indexed && path.includes("/checkout") && !/noindex/i.test(robots))
    record(category,"warn","CHECKOUT_NOINDEX_NOT_VISIBLE",path);
  if (indexed) {
    const canonicals = links(res.body,"canonical");
    if (!canonicals.length) record(category,"warn","CANONICAL_NOT_IN_HTML",path);
    else if (!canonicals.some(l=>isAllowed(l.href)))
      record(category,"fail","BAD_CANONICAL_HOST",path);
    const alt = links(res.body,"alternate").filter(l=>l.hreflang);
    if (!alt.length) record(category,"warn","MISSING_HREFLANG",path);
  }
  return res;
}
async function run() {
  const home = await request("/ar");
  if (home.status === 200) {
    for(const [key,code] of [["hsts","NO_HSTS"],["nosniff","NO_NOSNIFF"],["csp","NO_CSP"]])
      record("security",home.headers[key]?"pass":"fail",code,"/ar");
  } else record("security","fail","HOME_UNAVAILABLE","/ar");

  const geo = await request("/api/geo/client",100000);
  if (geo.status !== 200) record("geo","fail","GEO_API_UNAVAILABLE","/api/geo/client");
  else {
    let parsed;
    try { parsed=JSON.parse(geo.body); } catch {}
    record("geo",parsed && typeof parsed.ok==="boolean"?"pass":"fail","GEO_JSON","/api/geo/client");
    record("geo",/private|no-store/i.test(geo.headers.cache)?"pass":"fail",
      "GEO_PRIVATE_CACHE","/api/geo/client");
    if(parsed?.ok && !/^[A-Z]{2}$/.test(parsed.country_code||""))
      record("geo","fail","INVALID_COUNTRY_CODE","/api/geo/client");
  }
  const robots = await request("/robots.txt",150000);
  if (robots.status !== 200) record("seo","fail","ROBOTS_MISSING","/robots.txt");
  else {
    record("seo","pass","ROBOTS_200","/robots.txt");
    if(!robots.body.includes("sitemap.xml")) record("seo","warn","ROBOTS_NO_SITEMAP","/robots.txt");
    if(!/Disallow:\s*\/api\//i.test(robots.body)) record("seo","warn","ROBOTS_API_RULE","/robots.txt");
  }

  // Anonymous GET-only access: unexpected 200 JSON is potentially sensitive.
  // Never write the response body to any report.
  for(const path of ["/api/admin/audit-logs","/api/users/me/phone"]) {
    const a=await request(path,100000);
    if(a.error) record("privacy","warn",a.error,path);
    else if([401,403,404,405].includes(a.status))
      record("privacy","pass","ANONYMOUS_RESTRICTED_"+a.status,path);
    else record("privacy","fail","UNEXPECTED_ANONYMOUS_HTTP_"+a.status,path);
  }
  // NextAuth's public session endpoint must never return another user's data
  // to a request without cookies.
  const sess=await request("/api/auth/session",20000);
  if(sess.status===200) {
    let o;try{o=JSON.parse(sess.body)}catch {}
    record("privacy",!o?.user?"pass":"fail","ANONYMOUS_SESSION","/api/auth/session");
  } else record("privacy","warn","SESSION_HTTP_"+(sess.status||sess.error),"/api/auth/session");

  const sIndex=await request("/sitemap.xml",3500000);
  let candidates=[];
  if(sIndex.status !== 200) record("seo","fail","SITEMAP_INDEX_UNAVAILABLE","/sitemap.xml");
  else {
    record("seo","pass","SITEMAP_INDEX_200","/sitemap.xml");
    const locs=xmlLocs(sIndex.body).filter(isAllowedPath);
    if(!locs.length) record("seo","fail","SITEMAP_EMPTY","/sitemap.xml");
    else {
      const shards = /<sitemapindex/i.test(sIndex.body) ? locs.slice(0,12) : [];
      if(shards.length) {
        for(const shard of shards) {
          const u=new URL(shard);
          const s=await request(u.pathname,9000000);
          if(s.status!==200) record("sitemap","fail","SHARD_HTTP_"+(s.status||s.error),u.pathname);
          else if(s.truncated) record("sitemap","warn","SHARD_TRUNCATED",u.pathname);
          else {
            record("sitemap","pass","SHARD_OK",u.pathname);
            candidates.push(...xmlLocs(s.body).filter(isAllowedPath));
          }
        }
      } else candidates.push(...locs);
    }
  }

  const pool = [...new Set(candidates)]
    .filter(href=>!/(\/checkout|\/auth\/|\/success\/|\/donation-failed|\/dashboard\/)/i.test(new URL(href).pathname));
  report.sitemap = { sampledShardLimit: 12, sampledPublicUrlCount: pool.length };
  const byLocale={};
  for(const loc of SITE_LOCALES) byLocale[loc]=[];
  for(const item of pool) {
    const loc=new URL(item).pathname.split("/")[1];
    if(byLocale[loc]) byLocale[loc].push(item);
  }
  report.sitemap.samplingCoverage = Object.fromEntries(SITE_LOCALES.map(loc=>[loc,byLocale[loc].length]));

  // 38 deterministic live checks, one home/checkout for every public language.
  for(const loc of SITE_LOCALES){
    const homePath="/"+loc;
    const a=loc==="ar"?home:await checkPage(homePath,"locale-home",true);
    if(loc==="ar" && a.status===200) record("locale-home","pass","HOME_200",homePath);
    await checkPage("/"+loc+"/checkout","locale-checkout",false);
  }

  // Sample all locales and each shard, without crawling every public page or
  // overloading the production VPS. Max ~120 extra pages.
  const pick=[];
  for(let round=0;round<7;round++){
    for(const loc of SITE_LOCALES) {
      const arr=byLocale[loc];
      if(arr.length>round) pick.push(arr[Math.floor(round*(arr.length-1)/Math.max(1,6))]);
    }
  }
  for(const href of [...new Set(pick)].slice(0,127)){
    if(report.summary.requests>MAX_REQUESTS-15) break;
    const path=new URL(href).pathname;
    const x=await checkPage(path,"sitemap-public",true);
    if(x.status===200 && report.samples.length<50) report.samples.push({path,status:x.status});
  }
  report.sitemap.checkedPages=[...new Set(pick)].length;

  // Check a small set of internal links found in real HTML. Ignore financial
  // or authenticated destinations; never submit forms.
  const hrefs=[];
  for(const path of ["/ar","/en","/tr","/fr"]){
    const page=await request(path);
    if(page.status!==200) continue;
    for(const tag of tags(page.body,"a")){
      const href=attr(tag,"href");
      if(!href || href.startsWith("#") || href.startsWith("mailto:") ||
         href.startsWith("tel:") || !isAllowedPath(href)) continue;
      const u=new URL(href,ORIGIN);
      if(/\/api\/|\/checkout|\/auth\/|\/donation|\/cart\/|\/login|\/dashboard/.test(u.pathname)) continue;
      hrefs.push(u.pathname);
    }
  }
  for(const path of [...new Set(hrefs)].slice(0,24)){
    if(report.summary.requests>=MAX_REQUESTS) break;
    const p=await request(path,300000);
    record("internal-links",p.status===200?"pass":"warn",
      p.error || "HTTP_"+p.status,path);
  }

  if(report.summary.requests>=MAX_REQUESTS)
    record("coverage","skip","REQUEST_BUDGET_REACHED","public-url-sample");

  writeFileSync(OUT,JSON.stringify(report,null,2)+"\n",{mode:0o600});
  console.log("PUBLIC_SITE_AUDIT",JSON.stringify({
    status:report.summary.fail ? "FAIL" : "PASS_WITH_WARNINGS_POSSIBLE",
    ...report.summary, byCategory:report.byCategory, sitemap:report.sitemap,
    findings:report.findings.slice(0,32), reportFile:OUT,
  },null,2));
  if(report.summary.fail) process.exitCode=1;
}
await run().catch(e=>{
  report.summary.fail++;
  console.error("PUBLIC_SITE_AUDIT_FATAL",e?.name||"Error");
  writeFileSync(OUT,JSON.stringify(report,null,2)+"\n",{mode:0o600});
  process.exitCode=2;
});
