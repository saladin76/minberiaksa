import test from "node:test";
import assert from "node:assert/strict";
import { editorialFailure, selectEditorialRetries } from "../../lib/content-editor/editorial-failure";

test("only known temporary errors are eligible for a bounded batch retry", () => {
  const jobs = Array.from({length:25},(_,id)=>({id,error:"AI_RATE_LIMITED (429)",attempts:1,updatedAt:"2026-10-01T00:00:00Z"}));
  const request = {id:100,error:"رفض المزوّد صيغة الطلب (400)",attempts:1,updatedAt:"2026-10-01T00:00:00Z"};
  const exhausted = {id:101,error:"AI_TIMEOUT",attempts:3,updatedAt:"2026-10-01T00:00:00Z"};
  const result = selectEditorialRetries([...jobs,request,exhausted]);
  assert.equal(result.selected.length,20); assert.equal(result.remaining,5); assert.equal(result.blocked,2);
  assert.equal(result.selected.includes(request),false); assert.equal(result.selected.includes(exhausted),false);
});

test("saved errors describe their own category without claiming that the current provider is broken", () => {
  assert.equal(editorialFailure("AI_QUOTA_EXCEEDED (429)").kind,"billing");
  assert.equal(editorialFailure("AI_MODEL_UNAVAILABLE").kind,"model");
  assert.equal(editorialFailure("Unrecognized error").temporary,false);
  assert.equal(editorialFailure(null).temporary,false);
});

 test("fresh failures wait for cooldown and missing timestamps require review",()=>{
 const now=new Date("2026-10-28T00:00:00Z");
 const ready={error:"AI_RATE_LIMITED (429)",attempts:1,updatedAt:"2026-10-27T23:49:59Z"};
 const fresh={...ready,updatedAt:"2026-10-27T23:55:00Z"};
 const missing={error:ready.error,attempts:1};
 assert.deepEqual(selectEditorialRetries([ready,fresh,missing],now).selected,[ready]);
 });
