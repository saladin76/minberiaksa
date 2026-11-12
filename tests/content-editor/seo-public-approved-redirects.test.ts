import assert from "node:assert/strict";
import test from "node:test";
import { validateReviewManifest } from "../../scripts/seo-validate-approved-redirects.mjs";

const row = () => ({
  sourcePath:"/ar/bagislar/gaza-bread",
  locale:"ar",
  status:"ENTITY_REVIEW_TRANSLATION_AND_TARGET",
  family:"project",
  entityId:"project-42",
  proposedTarget:null,
  approved:false,
  redirectCode:null,
});
const manifest = (...rows: Record<string, unknown>[]) => ({status:"REVIEW_ONLY_NOT_FOR_REDIRECTS",rows});
// The JS validator returns generic issue objects; narrow before reading the code field.
const hasIssue = (issues: readonly object[], code: string): boolean =>
  issues.some(issue => "code" in issue && issue.code === code);

test("all 1398 unapproved inventory rows remain safely blocked", () => {
  const rows=Array.from({length:1398},(_,i)=>({
    ...row(),sourcePath:"/ar/bagislar/slug-"+i
  }));
  const result=validateReviewManifest(manifest(...rows));
  assert.equal(result.valid,true);
  assert.equal(result.blockedCount,1398);
  assert.equal(result.redirectCount,0);
});

test("reject unapproved rows with assigned redirects",()=>{
  const result=validateReviewManifest(manifest({
    ...row(), proposedTarget:"/ar/المشاريع/خبز-غزة",redirectCode:308
  }));
  assert.equal(result.valid,false);
  assert.ok(hasIssue(result.issues, "UNAPPROVED_WITH_REDIRECT"));
});

test("reject self redirects and missing validation evidence",()=>{
  const result=validateReviewManifest(manifest({
    ...row(),approved:true,redirectCode:301,proposedTarget:row().sourcePath
  }));
  assert.equal(result.valid,false);
  assert.ok(hasIssue(result.issues, "REDIRECT_TO_SELF"));
  assert.ok(hasIssue(result.issues, "MISSING_VERIFIED_TARGET_EVIDENCE"));
});

test("reject redirects that target sensitive financial paths",()=>{
  const result=validateReviewManifest(manifest({
    ...row(),approved:true,redirectCode:308,proposedTarget:"/ar/checkout"
  }));
  assert.ok(hasIssue(result.issues, "RESERVED_TRANSACTION_PATH"));
});

test("reject mismatched entity and locale",()=>{
  const result=validateReviewManifest(manifest({
    ...row(),approved:true,redirectCode:301,proposedTarget:"/en/donate/gaza-bread",
    targetProof:{httpStatus:200,selfCanonical:true,indexable:true,contentReady:true,
      entityId:"project-99",family:"project",locale:"en",urlPath:"/en/donate/gaza-bread"},
    evidenceSources:["sitemap-export-20261111"]
  }));
  assert.ok(hasIssue(result.issues, "ENTITY_IDENTITY_MISMATCH"));
  assert.ok(hasIssue(result.issues, "CROSS_LANGUAGE_REDIRECT_REQUIRES_MANUAL_PLAN"));
});

test("reject chains even with otherwise complete supplied evidence",()=>{
  function approved(from: string, to: string){
    return {...row(),sourcePath:from,approved:true,redirectCode:308,proposedTarget:to,
      targetProof:{httpStatus:200,selfCanonical:true,indexable:true,contentReady:true,
      entityId:"project-42",family:"project",locale:"ar",urlPath:to},
      evidenceSources:["verified-sitemap","human-reviewed"]}
  }
  const result=validateReviewManifest(manifest(
    approved("/ar/bagislar/first","/ar/المشاريع/second"),
    approved("/ar/المشاريع/second","/ar/المشاريع/final")
  ));
  assert.ok(hasIssue(result.issues, "REDIRECT_CHAIN"));
});

test("accept structurally approved alias with complete provided evidence",()=>{
  const path="/ar/المشاريع/خبز-غزة";
  const result=validateReviewManifest(manifest({
    ...row(),approved:true,redirectCode:308,proposedTarget:path,
    targetProof:{httpStatus:200,selfCanonical:true,indexable:true,contentReady:true,
      entityId:"project-42",family:"project",locale:"ar",urlPath:path},
    evidenceSources:["historic-sitemap-20261111","human-reviewed"]
  }));
  assert.deepEqual(result.issues,[]);
  assert.equal(result.redirectCount,1);
});
