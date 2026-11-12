/**
 * Validate a proposed redirect manifest before any routing code can consume it.
 * No HTTP, database access, redirects, or writes. Fail closed.
 *
 * Review manifest rows are NOT approvals. This gate only verifies structure
 * and supplied evidence; external HTTP/SEO and financial checks remain required.
 */
const LOCALES = new Set(["ar","tr","en","fr","de","es","id","pt","ur","sq","it","nl","sv","no","da","ms","ja","zh","hi"]);
const RESERVED = new Set([
  "api","auth","dashboard","cart","checkout","account","success",
  "receipt","certificates","payment-failed","payment-cancelled",
  "payment-processing","payment-pending","donation-failed",
  "donation-success","maintenance"
]);
// These are real or legacy public landing destinations, not generic catalogue aliases.
// They require a separate signed content-equivalence and ads migration decision.
const PROTECTED_EXISTING_ROUTES = new Set(["campaigns","donates","bank-transfer"]);

export function strictPublicPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") ||
      value.includes("?") || value.includes("#") || /[\x00-\x1f\x7f\\]/.test(value) ||
      /%(?:2f|5c|00|2e)/i.test(value)) throw new Error("INVALID_PUBLIC_PATH");
  let path;
  try { path = decodeURI(value).normalize("NFC"); }
  catch { throw new Error("INVALID_PUBLIC_PATH_ENCODING"); }
  if (path.includes("//") || /%(?:2f|5c|00|2e)/i.test(path) ||
      path.split("/").some(s => s === "." || s === ".."))
    throw new Error("AMBIGUOUS_PUBLIC_PATH");
  path = path.replace(/\/+$/, "") || "/";
  const pieces = path.split("/").filter(Boolean);
  if (!LOCALES.has(pieces[0])) throw new Error("UNKNOWN_LOCALE");
  return { path, locale: pieces[0], head: pieces[1] ?? "" };
}

/**
 * @param {{status?:string,rows?:Array<object>}} manifest
 * @returns {{valid:boolean,sourceCount:number,redirectCount:number,blockedCount:number,issues:Array<object>}}
 */
export function validateReviewManifest(manifest) {
  const issues=[];
  if (manifest?.status !== "REVIEW_ONLY_NOT_FOR_REDIRECTS" || !Array.isArray(manifest.rows)) {
    return {valid:false,sourceCount:0,redirectCount:0,blockedCount:0,
      issues:[{code:"INVALID_MANIFEST_SCHEMA"}]};
  }
  const sources=new Set();
  const redirects=new Map();
  let redirectCount=0, blockedCount=0;

  for (const [index,row] of manifest.rows.entries()) {
    let source;
    try { source=strictPublicPath(row.sourcePath); }
    catch (e) { issues.push({index,code:"BAD_SOURCE_PATH",details:e.message});continue; }
    if (sources.has(source.path)) issues.push({index,code:"DUPLICATE_SOURCE",path:source.path});
    sources.add(source.path);
    if (row.locale !== source.locale)
      issues.push({index,code:"SOURCE_LOCALE_MISMATCH",path:source.path});
    if (!row.approved) {
      blockedCount++;
      if (row.redirectCode != null || row.proposedTarget != null)
        issues.push({index,code:"UNAPPROVED_WITH_REDIRECT",path:source.path});
      continue;
    }
    redirectCount++;
    let target;
    try { target=strictPublicPath(row.proposedTarget); }
    catch(e) { issues.push({index,code:"BAD_TARGET_PATH",details:e.message});continue; }
    if (![301,308].includes(row.redirectCode))
      issues.push({index,code:"INVALID_REDIRECT_CODE",path:source.path});
    if (source.path === target.path)
      issues.push({index,code:"REDIRECT_TO_SELF",path:source.path});
    if (source.locale !== target.locale)
      issues.push({index,code:"CROSS_LANGUAGE_REDIRECT_REQUIRES_MANUAL_PLAN",path:source.path});
    if (RESERVED.has(source.head) || RESERVED.has(target.head))
      issues.push({index,code:"RESERVED_TRANSACTION_PATH",path:source.path});
    if (PROTECTED_EXISTING_ROUTES.has(source.head) || PROTECTED_EXISTING_ROUTES.has(target.head))
      issues.push({index,code:"PROTECTED_EXISTING_ROUTE",path:source.path});

    // A redirect must not claim that a different immutable entity owns its target.
    if (row.family !== null && row.entityId != null &&
        (row.targetProof?.entityId !== row.entityId ||
         row.targetProof?.family !== row.family))
      issues.push({index,code:"ENTITY_IDENTITY_MISMATCH",path:source.path});
    if (row.targetProof?.httpStatus !== 200 ||
        row.targetProof?.selfCanonical !== true ||
        row.targetProof?.indexable !== true ||
        row.targetProof?.locale !== target.locale ||
        row.targetProof?.contentReady !== true ||
        row.targetProof?.urlPath !== target.path)
      issues.push({index,code:"MISSING_VERIFIED_TARGET_EVIDENCE",path:source.path});
    if (!Array.isArray(row.evidenceSources) || row.evidenceSources.length < 1 ||
        row.evidenceSources.some(x=>typeof x!=="string"||!x.trim()))
      issues.push({index,code:"MISSING_HISTORICAL_SOURCE_EVIDENCE",path:source.path});
    redirects.set(source.path,target.path);
  }

  for (const [from,to] of redirects) {
    if (redirects.has(to))
      issues.push({code:"REDIRECT_CHAIN",path:from,next:to});
  }
  return {valid:issues.length===0,sourceCount:sources.size,redirectCount,blockedCount,issues};
}
